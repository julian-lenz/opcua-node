import {DmxUniverses} from "../artnet";

//Function which takes a universe and channel and applies a sine wave to the channel
export function sineWave(dmxUniverses: DmxUniverses, universe: number, channel: number) {
    let i = 0
    const sineInterval = setInterval(() => {
        // The sine should be between 0 and 25
        const value = Math.round((Math.sin(i) + 1) * 127.5)
        dmxUniverses.setChannel(universe, channel, value)
        i += 0.05
    }, 5);
    setTimeout(() => {
        clearInterval(sineInterval)
    }, 10000)
}