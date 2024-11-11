import * as dmxlib from 'dmxnet';
import YAML from 'yaml';
import * as fs from "fs";
import {ArtnetConfig} from "./Interface/artnetConfig";

// Path to the Artnet configuration file
const artnetConfigPath = process.env.ARTNETCONFIGPATH || "../artnetconfig.yml";
// Parse the Artnet configuration file
const artnetConfig = YAML.parse(fs.readFileSync(artnetConfigPath, 'utf8')) as ArtnetConfig;


/**
 * Class representing DMX Universes
 */
export class DmxUniverses {
    // Map to store universe data
    private universeData: Map<number, number[]> = new Map<number, number[]>();
    private universeDataPrep: Map<number, number[]> = new Map<number, number[]>();

    // DMXNet instance for Artnet commnunication
    readonly dmxnet = new dmxlib.dmxnet({
        hosts: ["192.168.0.20"],
    });

    /**
     * DmxUniverses constructor
     */
    constructor() {
        this.setUpSenders();
    }

    /**
     * Set up senders for each node in the Artnet configuration
     */
    private setUpSenders() {
        for (const node of artnetConfig.nodes) {
            for (const _universe of node.universes) {
                const {subnet, universe, net} = this.universeToNetSubnetUniverse(_universe)
                this.dmxnet.newSender({ip: node.ip, subnet, universe, net})
                this.universeData.set(_universe, Array(512).fill(0));
                this.universeDataPrep.set(_universe, Array(512).fill(0));
            }
        }
    }

    /**
     * Convert not, subnet and universe to universe
     * @param {number} net - The net value, one net is 256 universes
     * @param {number} subnet - The subnet value, one subnet is 16 universes
     * @param {number} universe - The universe value
     * @returns {number} - The converted universe value
     */
    private subnetUniverseToUniverse(net: number, subnet: number, universe: number) {
        if (net > 15 || subnet > 15 || universe > 15) {
            throw new Error("Invalid subnet, universe or net")
        }
        if (net < 0 || subnet < 0 || universe < 0) {
            throw new Error("Invalid subnet, universe or net")
        }
        return net * 256 + subnet * 16 + universe;
    }

    /**
     * Convert universe to net, subnet and universe
     * @param {number} universe - The universe value
     * @returns {object} - The converted net, subnet and universe values
     */
    private universeToNetSubnetUniverse(universe: number) {
        return {
            net: Math.floor(universe / 256),
            subnet: Math.floor(universe / 16) % 16,
            universe: universe % 16
        }
    }

    /**
     * Get sender for a given universe
     * @param {number} universe - The universe value
     * @returns {dmxlib.sender | undefined} - The sender for the given universe
     */
    getSender(universe: number): dmxlib.sender | undefined {
        return this.dmxnet.senders.find((s) => this.subnetUniverseToUniverse(s.net, s.subnet, s.universe) === universe);
    }

    /**
     * Fill channels with a given value
     * @param {number} universe - The universe value
     * @param {number} start - The start channel, first channel is 1
     * @param {number} stop - The stop channel
     * @param {number} value - The value to fill the channels with
     */
    fillChannels(universe: number, start: number, stop: number, value: number) {
        if (start < 1 || stop > 512 || start > stop) {
            console.error(`Channel out of bounds: ${start} - ${stop}`);
            return;
        }
        const sender = this.getSender(universe);
        if (sender === undefined) {
            console.error(`Sender not found for universe: ${universe}`);
            return;
        }
        this.universeData.get(universe)!.fill(value, start, stop);
        sender.fillChannels(start - 1, stop - 1, value);
        console.log(`Set channels ${start} to ${stop} to value ${value},\             timestamp:`, new Date())
    };

    /**
     * Reset a given universe
     * @param {number} universe - The universe value
     */
    reset(universe: number) {
        const sender = this.getSender(universe);
        if (sender === undefined) {
            console.error(`Sender not found for universe: ${universe}`);
            return;
        }
        sender.reset();
        this.universeData.get(universe)!.fill(0);
    };

    /**
     * Set a channel to a given value
     * @param {number} universe - The universe value, first universe is 0
     * @param {number} channel - The channel value, first channel is 1
     * @param {number} value - The value to set the channel to
     */
    setChannel(universe: number, channel: number, value: number) {
        if(channel < 1 || channel > 512){
            console.error(`Channel ${channel} out of bounds`)
            return
        }
        const sender = this.getSender(universe);
        if (sender) {
            sender.setChannel(channel - 1, value);
            this.universeData.get(universe)![channel] = value;
            //console.log(`Set channel: ${channel} to value: ${value} in universe: ${universe},\  timestamp:`, new Date())
            //console.log(`${universe};${channel};${value};${new Date().toISOString()}`)
        } else
            console.error(`Sender not found for universe: ${universe}`);
    }

    /**
     * Get the value of a channel in a given universe
     * @param {number} universe - The universe value
     * @param {number} channel - The channel value
     * @returns {number} - The value of the channel in the given universe or 0 if not found
     */
    getValue(universe: number, channel: number) {
        const data = this.universeData.get(universe);
        return data ? data[channel] : 0;
    }

    /**
     * Prepare a channel with a given value, will be transmitted when transmit(...) is called
     * @param {number} universe - The universe value
     * @param {number} channel - The channel value, first channel is 1
     * @param {number} value - The value to prepare the channel with
     */
    prepChannel(universe: number, channel: number, value: number) {
        if(channel < 1 || channel > 512){
            console.error(`Channel ${channel} out of bounds`)
            return
        }
        const sender = this.getSender(universe);
        if (sender === undefined) {
            console.error(`Sender not found for universe: ${universe}`);
            return;
        }
        this.universeDataPrep.get(universe)![channel] = value;
        sender.prepChannel(channel - 1, value);
    }

    /**
     * Transmit a given universe
     * @param {number} universe - The universe value
     */
    transmit(universe: number) {
        const sender = this.getSender(universe);
        if (sender === undefined) {
            console.error(`Sender not found for universe: ${universe}`);
            return;
        }
        this.universeDataPrep.get(universe)!.fill(0);
        sender.transmit();
    }
}
