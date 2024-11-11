import {
    AttributeIds,
    BrowseResult,
    DataType,
    DataValue,
    OPCUAClient,
    ReferenceDescription,
    StatusCodes,
    TimestampsToReturn,
} from 'node-opcua';

const endpointUrl = "opc.tcp://MacBook-Air-von-Julian-2.local:26543";
const nodeId = "ns=3;i=2024";

//open log file
const fs = require('fs');
const path = require('path');
const logPath = path.join(__dirname, 'log.csv');
const logStream = fs.createWriteStream(logPath, {flags: 'a'});
logStream.write('NodeId;Value;Timestamp\n');

const writableNodeIds = new Set(["ns=3;i=2026", "ns=3;i=2041", "ns=3;i=2040", "ns=3;i=2039", "ns=3;i=2032", "ns=3;i=2031", "ns=3;i=2030", "ns=3;i=2025", "ns=3;i=2024"]);

const testWrite = true;

async function main() {
    try {
        const client = OPCUAClient.create({
            endpointMustExist: false,
            connectionStrategy: {
                maxRetry: 2,
                initialDelay: 2000,
                maxDelay: 10 * 1000,
            },
        });
        client.on("backoff", () => console.log("retrying connection"));

        await client.withSessionAsync(endpointUrl, async (session) => {

                const browseResult: BrowseResult = (await session.browse(
                    "RootFolder"
                )) as BrowseResult;

                console.log(
                    browseResult.references
                        .map((r: ReferenceDescription) => r.browseName.toString())
                        .join("\n")
                );

                /*
                const dataValue = await session.read({
                    nodeId,
                    attributeId: AttributeIds.Value,
                });
                if (dataValue.statusCode !== StatusCodes.Good) {
                    console.log("Could not read ", nodeId);
                }
                console.log(` value of ${nodeId.toString()} = ${dataValue.value.toString()}`);
                */



                if(testWrite) {
                    await Promise.all(Array.from(writableNodeIds).map(async (nodeId) => {
                        for (let i = 0; i < 256 * 5; i++) {
                            await session.write({
                                nodeId: nodeId,
                                attributeId: AttributeIds.Value,
                                value: {
                                    statusCode: StatusCodes.Good,
                                    sourceTimestamp: new Date(),
                                    value: {
                                        dataType: DataType.Byte,
                                        value: i % 256,
                                    },
                                },
                            });
                            logStream.write(`${nodeId.slice(7)};${i % 256};${new Date().toISOString()}\n`);
                            console.log(`${nodeId.slice(7)};${i % 256};${new Date().toISOString()}\n`);
                            await new Promise((resolve) => setTimeout(resolve, 20));
                        }
                    }));
                }
                else {
                    // step 5: install a subscription and monitored item
                    const subscription = await session.createSubscription2({
                        requestedPublishingInterval: 1000,
                        requestedLifetimeCount: 100,
                        requestedMaxKeepAliveCount: 20,
                        maxNotificationsPerPublish: 10,
                        publishingEnabled: true,
                        priority: 10,
                    });

                    subscription
                        .on("started", () =>
                            console.log(
                                "subscription started - subscriptionId=",
                                subscription.subscriptionId
                            )
                        )
                        //.on("keepalive", () => console.log("keepalive"))
                        .on("terminated", () => console.log("subscription terminated"));

                    const monitoredItem = await subscription.monitor(
                        {
                            nodeId,
                            attributeId: AttributeIds.Value,
                        },
                        {
                            samplingInterval: 100,
                            discardOldest: true,
                            queueSize: 10,
                        },
                        TimestampsToReturn.Both
                    );

                    monitoredItem.on("changed", (dataValue: DataValue) => {
                        //console.log(` Value Changed = ${dataValue.value.value.toString()}`);
                    });

                }
                await subscription.terminate();
                console.log(" closing session");
            }
        )
        ;
    } catch
        (err) {
        console.log("Error !!!", err);
    }
}

main();