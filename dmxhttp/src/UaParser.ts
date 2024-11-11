import {getChannelIndex, getFixtureByName} from './Fixture';
import {JsonUaNode, JsonUAVariable, Reference, UaNodesetJSON} from './Interface/UANode';
import {DmxChannel} from "./Interface/dmxChannel";
import {Fixture} from "@show-runner/fixturelibrary/dist/src/types";

require('dotenv').config()
const dmxObjectTypeName = process.env.DMXOBJECTTYPENAME || ""
const universeObjectTypeName = process.env.UNIVERSEOBJECTTYPENAME || ""

/**
 * UaParser is a class that parses a nodeset and constructs a map between Node IDS and DMX Channels.
 * @class UaParser
 */
export class UaParser {
    private nodeset: UaNodesetJSON = {} as UaNodesetJSON;
    private nodeIdToDmx: Map<string, DmxChannel> = new Map<string, DmxChannel>();

    /**
     * Constructor for the UaParser class.
     * @param {UaNodesetJSON} nodeset - The nodeset to be parsed.
     */
    constructor(nodeset: UaNodesetJSON) {
        this.nodeset = nodeset;
    }

    /**
     * Returns the id of the UA object type.
     * @param {string} objectTypeName - The name of the object type.
     * @returns {string} The id of the UA object type.
     */
    private getUaObjectTypeId(objectTypeName: string): string {
        //find the id of the DMXLight object type
        const uaObjectType: JsonUaNode | undefined = this.nodeset.UAObjectType.find((obj) => obj.DisplayName === objectTypeName)
        if (!uaObjectType) {
            console.error('DMXLight object type not found in the nodeset')
            process.exit(1)
        }
        return uaObjectType.NodeId
    }

    /**
     * Returns all the UA objects of a given type.
     * @param {string} dmxObjectTypeId - The id of the DMX object type.
     * @returns {JsonUaNode[]} An array of UA objects of the given type.
     */
    private getUaObjects(dmxObjectTypeId: string): JsonUaNode[] {
        return this.nodeset.UAObject.filter(obj =>
            obj.References.Reference.some(ref =>
                ref.ReferenceType === 'HasTypeDefinition' && ref.text === dmxObjectTypeId
            )
        );
    }

    /**
     * Returns the UA object with a given id.
     * @param {string} nodeId - The id of the node.
     * @returns {JsonUaNode | undefined} The UA object with the given id, or undefined if not found.
     */
    private getUaObject(nodeId: string): JsonUaNode | undefined {
        return this.nodeset.UAObject.find((obj) => obj.NodeId === nodeId)
    }

    /**
     * Returns the UA variable with a given id.
     * @param {string} nodeId - The id of the node.
     * @returns {JsonUAVariable | undefined} The UA variable with the given id, or undefined if not found.
     */
    private getVariable(nodeId: string): JsonUAVariable | undefined {
        return this.nodeset.UAVariable.find((v) => v.NodeId === nodeId)
    }

    /**
     * Returns all the variables of a node.
     * @param {JsonUaNode} node - The node.
     * @param {boolean} isProperty - Whether to return properties or variables.
     * @returns {JsonUAVariable[]} An array of variables of the node.
     */
    private getVariablesOfNode(node: JsonUaNode, isProperty: boolean): JsonUAVariable[] {
        const referenceType = isProperty ? 'HasProperty' : 'HasComponent'

        // Filter the references of the node to get only the properties or variables
        return node.References.Reference.filter((ref: Reference) => {
            return ref.ReferenceType === referenceType && (ref.IsForward === 'true' || ref.IsForward === undefined)
        }).map((ref: Reference) => {
            const variable = this.getVariable(ref.text)                           //ref.text = the node id
            if (variable) {
                return variable
            } else {
                console.error('Variable not found for Reference: ', ref.text)
                process.exit(1)
            }
        })
    }

    /**
     * Constructs the map between Node IDS and DMX Channels.
     * @returns {Promise<Map<string, DmxChannel>>} A promise that resolves to a map between Node IDS and DMX Channels.
     */
    public async loadFixturesFromNodeSet(): Promise<Map<string, DmxChannel>> {
        if (this.nodeset.UAObject === undefined || this.nodeset.UAObject.length === 0) {
            console.error('No objects found in the nodeset')
            process.exit(1)
        }
        console.log('Loading fixtures from NodeSet')
        // Get all the objects of the DMXLight type
        let fixtureObjects = this.getUaObjects(this.getUaObjectTypeId(dmxObjectTypeName))
        fixtureObjects = fixtureObjects.filter((lightObject) => {
            return !lightObject.References.Reference.some((ref) => ref.ReferenceType === 'HasModellingRule')
        })
        for (const fixtureObject of fixtureObjects) {
            const properties = this.getVariablesOfNode(fixtureObject, true)
            if (properties.length === 0) {
                console.error('No properties found for light object')
                process.exit(1)
            }
            // Extract relevant properties from the object
            const fixtureKey = properties.find((p) => p.DisplayName == 'FixtureKey')?.Value as string
            const manufacturerKey = properties.find((p) => p.DisplayName === 'Manufacturer')?.Value as string
            const mode = properties.find((p) => p.DisplayName === 'Mode')?.Value as string
            const address = properties.find((p) => p.DisplayName === 'Address')?.Value as number

            const dmxProperties = {fixtureKey, manufacturerKey, mode, address};
            Object.entries(dmxProperties).forEach(([key, value]) => {
                if (!value) {
                    console.error(`${key} not found`);
                    process.exit(1);
                }
            });

            // Load the fixture from the fixture library
            const fixture: Fixture = await getFixtureByName(fixtureKey, manufacturerKey)

            if (!fixture) {
                console.error(`Fixture not found: ${manufacturerKey}/${fixtureKey}`)
                process.exit(1)
            }
            const fixturesFolder = this.getUaObject(fixtureObject.ParentNodeId!);
            const universe = this.getUaObject(fixturesFolder!.ParentNodeId!);
            const universeIdNode = this.getVariablesOfNode(universe!, true)[0] as JsonUAVariable    // the only property should be the universe id;
            const universeId = universeIdNode.Value;
            const capabilitiesID = fixtureObject.References.Reference.filter((ref) => ref.ReferenceType === 'HasComponent')[0].text // the only folder should be capabilities
            const variables = this.getVariablesOfNode(this.getUaObject(capabilitiesID)!, false);
            for (const variable of variables) {
                const channelName = variable.DisplayName
                const channelIndex = getChannelIndex(channelName, fixture, mode, address)

                this.nodeIdToDmx.set(variable.NodeId, {Universe: universeId, Channel: channelIndex})
                console.log(`Fixture: ${manufacturerKey}/${fixtureKey}, Mode: ${mode}, Address: ${address}, Channel: ${channelName}, Index: ${channelIndex}`)
            }
        }
        return this.nodeIdToDmx
    }
}