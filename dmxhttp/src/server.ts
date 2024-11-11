/**
 * This script sets up an Express server that handles GET and PUT requests for a OPC UA variables with a given Nodeid.
 * The node id is used to find the corresponding DMX Universe and Channel in the nodeset file.
 * The GET request returns the value of the variable, and the PUT request sets the value of the variable.
 *
 * @module server
 */

import express, {Express, Request, Response} from 'express';
import dotenv from "dotenv";
import * as fs from "fs";
import path from "path";
import {XMLParser} from "fast-xml-parser";
import {JsonNodeSet} from "./Interface/UANode";
import {UaParser} from "./UaParser";
import {DmxUniverses} from "./artnet";
import {sineWave} from "./Interface/dmxutility";

dotenv.config();


const app: Express = express();
app.use(express.json());

// open log file
const logPath = path.join(__dirname, 'log.csv');
const logStream = fs.createWriteStream(logPath, {flags: 'a'});
logStream.write('NodeId;Value;Timestamp\n');

/**
 * Check if environment variables are set
 */
if (process.env.DMXOBJECTTYPENAME === undefined) {
    console.error("DMXOBJECTTYPENAME not set in .env")
    process.exit(1)
}
if (process.env.UNIVERSEOBJECTTYPENAME === undefined) {
    console.error("UNIVERSEOBJECTTYPENAME not set in .env")
    process.exit(1)
}

const modelsPath = path.join(__dirname, '../', process.env.MODELDIRECTORY || './models');
const dmxUniverses = new DmxUniverses();


/**
 * Load XML measurements from the models directory
 */
const files = fs.readdirSync(modelsPath).filter((file) => file.endsWith(".xml"));
if (files.length === 0) {
    console.error("No XML measurements found in the models directory");
    process.exit(1);
}
const nodesetFilename = files[0];
const nodeset = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    textNodeName: "text"
}).parse(fs.readFileSync(path.join(modelsPath, nodesetFilename), 'utf8')) as JsonNodeSet;

const uaParser = new UaParser(nodeset.UANodeSet);

(async () => {
    const nodeidToDmx = await uaParser.loadFixturesFromNodeSet()
    console.log(nodeidToDmx)

    // run tests after "t" has been pressed
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', async (chunk) => {
        const text = chunk.toString('utf8');

        // Test pulses on Artnet (spontaneous change)
        if (text === 't') {
            console.log("Test pulses on Artnet")
            let i = 0
            const pulseInterval = setInterval(async () => {
                dmxUniverses.setChannel(0, i + 1, 255)
                await new Promise(r => setTimeout(r, 100));
                dmxUniverses.setChannel(0, i + 1, 0)
                i = ++i % 9
            }, 500);
            setTimeout(() => {
                clearInterval(pulseInterval)
            }, 10000)
        }
        //TODO: test fades over artnet (continuous change)
        if (text === 'f') {
            console.log("Test fades on Artnet")
            for (let i = 0; i < 1; i++) {
                sineWave(dmxUniverses, 0, i + 1)
                await new Promise(r => setTimeout(r, 100));
            }
        }
        if (text === 'n') {
            for (let i = 0; i < 9; i++) {
                dmxUniverses.setChannel(0, i + 1, 255)
            }
        }
        if (text === 'b') {
            for (let i = 0; i < 9; i++) {
                dmxUniverses.setChannel(0, i + 1, 0)
            }
        }
    });


    /**
     * Endpoint to get the XML Nodeset file
     */
    app.get("/", (req: Request, res: Response) => {
        if (files.length === 0) {
            res.sendStatus(404)
            return
        }
        if (files.length > 1) {
            res.sendStatus(400)
            return;
        }
        try {
            res.sendFile(path.join(modelsPath, nodesetFilename))
        } catch (err) {
            console.error("Error sending file: ", nodesetFilename, err)
        }
        console.log("Sent file: ", nodesetFilename)
    });

    /**
     * Endpoint to get the channel value
     */
    app.get('/variable/:id', function (req, res, next) {
        //console.log("GET request received:" + req.path)
        if (!req.params.id) {
            return res.status(400).send('Missing required parameters: id');
        }
        next();
    }, function (req: Request, res: Response) {
        const I = `ns=1;i=${req.params.id}`;                        //TODO: Namespace is hardcoded
        const universe = nodeidToDmx.get(I)?.Universe
        const channel = nodeidToDmx.get(I)?.Channel
        if (universe === undefined || channel === undefined) {
            res.sendStatus(404)
            console.log("UA Node not found")
        } else {
            //console.log(`Sending Value for univ: ${universe}, channel: ${channel}; ` + dmxUniverses.getValue(universe, channel))
            res.send({value: dmxUniverses.getValue(universe, channel)});
        }
    });

    /**
     * Endpoint to set the channel value
     */
    app.put('/variable/:id/', (req, res, next) => {
        if (!req.params.id) {
            return res.status(400).send('Missing required parameters: id');
        }
        if (!req.body.value) {
            return res.status(400).send('Missing required body: value');
        }
        next();
    }, function (req: Request, res: Response) {
        const I = `ns=1;i=${req.params.id}`;           //TODO: Namespace is hardcoded
        const universe = nodeidToDmx.get(I)?.Universe
        const channel = nodeidToDmx.get(I)?.Channel
        if (universe === undefined || channel === undefined) {
            res.status(404).send("UA Node not found")
        } else {
            const data = req.body.value;
            const value = data.value;
            dmxUniverses.setChannel(universe, channel, value);
            //console.log(`${req.params.id};${value};${new Date().toISOString()}`);
            logStream.write(`${req.params.id};${value};${new Date().toISOString()}\n`);
            res.send(`Universe: ${universe}, Channel: ${channel} = ${value}`);
        }
    });

    /**
     * Start the server
     */
    app.listen(process.env.PORT || 3000, () => {
        console.log(`[server]: Server is running at http://localhost:${process.env.PORT || 3000}`);
    });
})()