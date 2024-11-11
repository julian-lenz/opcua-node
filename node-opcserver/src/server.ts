import {
    BindVariableOptionsVariation2,
    CallbackT,
    coerceNodeId,
    DataType,
    DataValue,
    INamespace,
    MessageSecurityMode,
    nodesets,
    OPCUAServer,
    SecurityPolicy,
    StatusCode,
    StatusCodes,
    UAVariable,
    Variant
} from 'node-opcua';
import {XMLParser} from "fast-xml-parser";
import * as fs from "fs";
import axios from "axios";
import path from "path";
import {JsonUAVariable, UaNodesetJSON} from "./UANode";
import {isWithinBounds} from "./utility";


require('dotenv').config()

const baseURL = 'http://127.0.0.1';
const nodesetDirectory = process.env.MODELDIRECTORY || "./models";
const nodesetFilenames: string[] = [];

// Create an instance of the XMLParser with the options to include attributes
const parser = new XMLParser({ignoreAttributes: false, attributeNamePrefix: ""});


async function fetchNodeset(port: number): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
        try {
            console.log(`Fetching data from port ${port}...`)
            const response = await axios.get(`${baseURL}:${port}`, {
                headers: {'Accept': 'application/xml'},
                responseType: 'text'
            });

            if (response.status !== 200) {
                console.error(`Bad response from port ${port}:`, response.status);
                reject(`Bad response from port ${port}: ${response.status}`);
            }
            const xmlData = response.data;
            const filename = `nodeset_${port}.xml`
            const filePath = path.join(nodesetDirectory, filename);

            fs.writeFileSync(filePath, xmlData, 'utf8');
            console.log(`File saved: ${filePath}`);
            resolve(filePath);
        } catch (error) {
            console.error(`Error fetching data from port ${port}:`, error);
            reject(error);
        }
    });
}


async function fetchAllNodesets(ports: number[]): Promise<string[]> {
    // Ensure the save directory exists
    if (!fs.existsSync(nodesetDirectory)) {
        fs.mkdirSync(nodesetDirectory);
    }
    // delete all measurements in the directory
    fs.readdirSync(nodesetDirectory).forEach(file => {
        fs.unlinkSync(path.join(nodesetDirectory, file));
    });

    const fetchPromises = ports.map(port => fetchNodeset(port));
    const filenames = await Promise.all(fetchPromises);

    console.log('All data fetched and saved');
    return filenames;
}

async function fetchVariableData(node: UAVariable, host: string): Promise<any> {
    let value;
    const nodeId = node.nodeId.value;
    const url = `${host}/variable/${nodeId}`;
    //console.log(`Fetching data from ${url} ...`)
    let response;
    try {
        response = await axios.get(url, {
            headers: {'Accept': 'application/json'},
            responseType: 'json'
        });
        if (response.status !== 200) {
            console.error(`Bad response from ${url}:`, response.status);
            return;
        }
    } catch (error) {
        console.error(`Error fetching data from ${url}:`, error);
        return;
    }
    const data = response.data.value;
    //  console.log(`Received data: ${data}`);
    if (node.getBasicDataType() === DataType.Double || node.getBasicDataType() === DataType.Float) {
        value = parseFloat(data);
    } else if (node.getBasicDataType() === DataType.String) {
        value = data;
    }
    // if the value is any of the integer types
    else if (isWithinBounds(node.getBasicDataType().valueOf(), 2, 9)) {
        value = parseInt(data);
    }
    return value;
}

async function setVariableData(node: UAVariable, host: string, value: any): Promise<any> {
    const body = {value: value};
    return axios.put(`${host}/variable/${node.nodeId.value}`, body);
}


/**
 * @param node - The node to setup the variable for
 * @param host - The host address (and port) to get the data from
 */
function setupVariable(node: UAVariable, host: string) {
    const dataType = node.getBasicDataType();

    const options2: BindVariableOptionsVariation2 = {
        timestamped_get: async (callback: CallbackT<DataValue>) => {
            try {
                const value = await fetchVariableData(node, host);
                const timestamp = new Date()
                if (value === undefined) {
                    callback(null, new DataValue({statusCode: StatusCodes.BadInternalError}));
                    return;
                }
                callback(null, new DataValue({value: new Variant({dataType: dataType, value: value}), serverTimestamp: timestamp, sourceTimestamp: timestamp}))
            } catch (error) {
                console.error(`Error fetching data from ${host}:`, error);
            }

        },
        timestamped_set: async (dataValue: DataValue, callback: CallbackT<StatusCode>) => {
            try {
                await setVariableData(node, host, dataValue.value);
                callback(null, StatusCodes.Good);
            } catch (error) {
                console.error(`Error setting data for ${host}:`, error);
                callback(null, StatusCodes.BadInternalError);
            }
        }
    };
    node.bindVariable(options2, false);
    node.addressSpace.installHistoricalDataNode(node)

    // Set the access level to 3 (read/write); The AccessLevelType is defined in 8.57.
    node.userAccessLevel = 3;
    node.accessLevel = 3;
}

function setupAllVariables(namespace: INamespace, port: number) {
    const nodesxml = fs.readFileSync(path.join(nodesetDirectory, `nodeset_${port}.xml`), 'utf8');
    const nodes = parser.parse(nodesxml).UANodeSet as UaNodesetJSON;
    const {UAVariable} = nodes;

    const variableTypeNodeid = coerceNodeId(63); // 63 is type baseVariable; 12 would be id of a Property
    UAVariable.forEach((variable: JsonUAVariable) => {
        const nodeid = coerceNodeId(variable.NodeId);
        nodeid.namespace = namespace.index;
        const node = namespace.findNode2(nodeid) as UAVariable;
        if (node.typeDefinition.value == variableTypeNodeid.value)
        {
            const host = "http://127.0.0.1:" + port;
            setupVariable(node, host);
            console.log(`Variable setup for ${node.browseName.toString()}`);
        }
    });

}


(async () => {
        try {
            const args = process.argv.slice(2);
            if (args.length < 1) {
                console.error("Usage: node server.ts <port1> <port2> ...");
                process.exit(1);
            }
            const ports = args.map((x) => {
                const num = parseInt(x)
                if (Number.isNaN(num)) {
                    console.error("Invalid port number");
                    process.exit(1);
                }
                return num;
            });

            nodesetFilenames.push(nodesets.standard);
            nodesetFilenames.push(nodesets.di);
            (await fetchAllNodesets(ports)).forEach((filename) => {
                console.log(`Adding nodeset: ${filename}`)
                nodesetFilenames.push(filename);
            });

            if (nodesetFilenames.length === 2) {
                console.error("No nodesets found");
            }

            // Create a user manager
            var userManager = {
                isValidUser: function (userName: string, password: string) {
                    if (userName === process.env.TESTUSER && password === process.env.TESTPASSWORD) {
                        return true;
                    }
                    if (userName === "user2" && password === "password2") {
                        return true;
                    }
                    return false;
                },
            };

            // Create an instance of OPCUAServer
            const server: OPCUAServer = new OPCUAServer({
                port: 26543, // the port of the listening socket of the server
                nodeset_filename: nodesetFilenames,
                buildInfo: {
                    productName: 'Modular NodeOPCUA Gateway',
                    buildNumber: '1',
                    buildDate: new Date()
                },
                securityPolicies: [SecurityPolicy.None, SecurityPolicy.Basic256Sha256],
                userManager: userManager,
            });


            await server.initialize();
            console.log("certificateFile = ", server.certificateFile);
            console.log("privateKeyFile  = ", server.privateKeyFile);

            const namespace = server.engine.addressSpace!.getOwnNamespace();
            for (const port of ports) {
                try {
                    const namespace = server.engine.addressSpace!.getNamespace(3 + ports.indexOf(port));
                    setupAllVariables(namespace, port);
                } catch (error) {
                    console.error(`Error setting up variables for port ${port}:`, error);
                }
            }

            // we can now start the server
            await server.start();
            console.log('Server is now listening ... ( press CTRL+C to stop) ');
            server.endpoints[0].endpointDescriptions().forEach((endpoint) => {
                // @ts-ignore
                console.log(endpoint.endpointUrl, MessageSecurityMode[endpoint.securityMode], endpoint.securityPolicyUri.toString().padEnd(60));
                // @ts-ignore
                console.log("    ", endpoint.userIdentityTokens.map((x) => x.policyId.toString()).join(' '));
            });

            //console.log(server.engine.addressSpace.getOwnNamespace())

            await new Promise((resolve) => process.once('SIGINT', resolve));

            await server.shutdown();
            console.log('server shutdown completed !');
        } catch
            (err: any) {
            console.log(err.message);
            process.exit(-1);
        }
    }
)
();
