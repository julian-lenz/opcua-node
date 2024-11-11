import * as fs from 'fs';

import * as path from 'path';
import {nodeMap} from "./nodemap";
import csvParser from "csv-parser";

const folderPath = path.join(__dirname, '../measurements/write2_20ms');

type ValueTimestamp = {
    Value: number;
    SourceTimestamp: Date;
}

type IdValueTimestamp = {
    NodeId: number;
    Value: number;
    SourceTimestamp: Date;
}

type BackendFileEntry = {
    NodeId: number;
    Value: number;
    SourceTimestamp: Date;
};

type FrontendFileEntry = {
    NodeId: number;
    Value: number;
    SourceTimestamp: Date;
};

type Mapping = {
    Universe: number;
    Channel: number;
};

type TimedeltaStats = {
    minDelta: number;
    maxDelta: number;
    avgDelta: number;
    stdDev: number;
    minDeltaTimestamp: Date;
    maxDeltaTimestamp: Date;
};

async function readCSVFile<T>(filePath: string, parser: (row: any) => T): Promise<T[]> {
    const results: T[] = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csvParser({separator: ';'}))
            .on('data', (row) => results.push(parser(row)))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

function parseBackendFileRow(row: any): BackendFileEntry {
    return {
        NodeId: parseInt(row['Channel']),
        Value: parseInt(row['Value']),
        SourceTimestamp: new Date(row['SourceTimestamp (UTC)']),
    };
}

function parseFrontendFileRow(row: any): FrontendFileEntry {
    return {
        NodeId: row['NodeId'],
        Value: parseInt(row['Value']),
        SourceTimestamp: new Date(row['SourceTimestamp (UTC)']),
    };
}

function parseIdValueTimestamp(row: any): IdValueTimestamp {
    return {
        NodeId: parseInt(row['NodeId']),
        Value: parseInt(row['Value']),
        SourceTimestamp: new Date(row['Timestamp']),
    };
}

function parseValueTimestamp(row: any): ValueTimestamp {
    return {
        Value: parseInt(row['Value']),
        SourceTimestamp: new Date(row['Timestamp']),
    };
}


function calculateStandardDeviation(deltas: number[], mean: number): number {
    const variance = deltas.reduce((sum, delta) => sum + Math.pow(delta - mean, 2), 0) / deltas.length;
    return Math.sqrt(variance);
}

function calculateTimedeltaStats(deltas: number[], timestamps: Date[]): TimedeltaStats {
    if (deltas.length === 0) return {
        minDelta: 0,
        maxDelta: 0,
        avgDelta: 0,
        stdDev: 0,
        minDeltaTimestamp: new Date(),
        maxDeltaTimestamp: new Date()
    };

    const minDelta = Math.min(...deltas);
    const maxDelta = Math.max(...deltas);
    const avgDelta = deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length;
    const stdDev = calculateStandardDeviation(deltas, avgDelta);

    const minDeltaIndex = deltas.indexOf(minDelta);
    const maxDeltaIndex = deltas.indexOf(maxDelta);

    return {
        minDelta,
        maxDelta,
        avgDelta,
        stdDev,
        minDeltaTimestamp: timestamps[minDeltaIndex],
        maxDeltaTimestamp: timestamps[maxDeltaIndex],
    };
}

async function analyzeFiles(firstFilePath: string, secondFilePath: string, map: Map<string, Mapping>) {
    const backendEntries = await readCSVFile(firstFilePath, parseValueTimestamp);
    const frontendEntries = await readCSVFile(secondFilePath, parseValueTimestamp);

    let deltas: number[] = [];
    let timestamps: Date[] = [];
    for (const frontendEntry of frontendEntries) {
        const backendEntry = backendEntries.find((entry) => {
            const isInRange = Math.abs(entry.SourceTimestamp.getTime() - frontendEntry.SourceTimestamp.getTime()) < 100;
            const areSameValue = entry.Value === frontendEntry.Value;
            return areSameValue && isInRange;
        });
        if (!backendEntry) {
            console.log(`No matching backend entry found for frontend entry at ${frontendEntry.SourceTimestamp.toISOString()}`);
            continue
        }
        const delta = frontendEntry.SourceTimestamp.getTime() - backendEntry.SourceTimestamp.getTime();
        deltas.push(delta);
        timestamps.push(frontendEntry.SourceTimestamp);
    }

    const stats = calculateTimedeltaStats(deltas, timestamps);

    console.log(`Min Delta: ${stats.minDelta} ms at ${stats.minDeltaTimestamp.toISOString()}`);
    console.log(`Max Delta: ${stats.maxDelta} ms at ${stats.maxDeltaTimestamp.toISOString()}`);
    console.log(`Avg Delta: ${stats.avgDelta} ms`);
    console.log(`Standard Deviation: ${stats.stdDev} ms`);
    console.log('----------------------');
}

async function analyzeFilesMultiNode(firstFilePath: string, secondFilePath: string, map: Map<string, Mapping>) {
    const unsortedBackendEntries = await readCSVFile(firstFilePath, parseIdValueTimestamp);
    const unsortedFrontendEntries = await readCSVFile(secondFilePath, parseIdValueTimestamp);

    const backendEntriesChannelMap = new Map<Number, BackendFileEntry[]>
    for (const entry of unsortedBackendEntries) {
        if (!backendEntriesChannelMap.has(entry.NodeId)) {
            backendEntriesChannelMap.set(entry.NodeId, []);
        }
        backendEntriesChannelMap.get(entry.NodeId)?.push(entry);
    }
    const frontendEntriesNodeMap = new Map<number, FrontendFileEntry[]>()
    for (const entry of unsortedFrontendEntries) {
        if (!frontendEntriesNodeMap.has(entry.NodeId)) {
            frontendEntriesNodeMap.set(entry.NodeId, []);
        }
        frontendEntriesNodeMap.get(entry.NodeId)?.push(entry);
    }

    let analyzedValues = 0;
    let deltas: number[] = [];
    let timestamps: Date[] = [];
    for (const [nodeId, frontendEntries] of frontendEntriesNodeMap) {
        const backendEntries = backendEntriesChannelMap.get(nodeId)!;
        console.log(frontendEntries)
        console.log(backendEntries)
        if (!backendEntries) {
            console.log(`No matching backend entries found for frontend entries with NodeId ${nodeId}`);
            continue;
        }
        for (const frontendEntry of frontendEntries) {
            const backendEntry = backendEntriesChannelMap.get(frontendEntry.NodeId)?.find((entry) => {
                const isInRange = Math.abs(entry.SourceTimestamp.getTime() - frontendEntry.SourceTimestamp.getTime()) < 100;
                const areSameValue = entry.Value === frontendEntry.Value;
                return areSameValue && isInRange;
            });
            if (!backendEntry) {
                console.log(`No matching backend entry found for frontend entry at ${frontendEntry.SourceTimestamp.toISOString()}`);
                continue
            }
            const delta = frontendEntry.SourceTimestamp.getTime() - backendEntry.SourceTimestamp.getTime();
            deltas.push(delta);
            timestamps.push(frontendEntry.SourceTimestamp);
            analyzedValues++;
        }
    }

    const stats = calculateTimedeltaStats(deltas, timestamps);
    console.log(`Analyzed ${analyzedValues} values`);
    console.log(`Min Delta: ${stats.minDelta} ms at ${stats.minDeltaTimestamp.toISOString()}`);
    console.log(`Max Delta: ${stats.maxDelta} ms at ${stats.maxDeltaTimestamp.toISOString()}`);
    console.log(`Avg Delta: ${stats.avgDelta} ms`);
    console.log(`Standard Deviation: ${stats.stdDev} ms`);
    console.log('----------------------');
}


// Paths to the CSV measurements
const firstFilePath = path.join(folderPath, 'backend.csv');
const secondFilePath = path.join(folderPath, 'frontend.csv');

// Execute the analysis
//analyzeFiles(firstFilePath, secondFilePath, nodeMap).catch((error) => {console.error('Error analyzing measurements:', error);});

analyzeFilesMultiNode(firstFilePath, secondFilePath, nodeMap).catch((error) => {
    console.error('Error analyzing measurements:', error);
});
