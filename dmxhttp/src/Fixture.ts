import {Fixture} from "@show-runner/fixturelibrary/dist/src/types";
import * as fs from "fs";
import path from "path";

require('dotenv').config()
if( process.env.FIXTUREDIRECTORY === undefined){
    console.error("FIXTUREDIRECTORY not set in .env")
    process.exit(1)
}
export function getFixtureByName(name: string, manufacturer: string): Fixture {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../', process.env.FIXTUREDIRECTORY!, manufacturer, `${name}.json`), 'utf8')) as Fixture
}

export function getChannelIndex(channelName: string, fixture: Fixture, mode: string, address: number) {
    if(channelName === ""){
        throw new Error("Channel name is empty")
    }
    if(mode === ""){
        throw new Error("Mode is empty")
    }
    if(address < 1){
        throw new Error("Address is less than 1")
    }

    const modeObj = fixture.modes.find((m) => m.shortName === mode)
    if (modeObj === undefined) {
        throw new Error("Mode not found")
    }
    const channelIndex = modeObj.channels.indexOf(channelName)
    if (channelIndex === -1) {
        throw new Error("Channel not found")
    }
    return channelIndex + address
}
