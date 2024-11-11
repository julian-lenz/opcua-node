// Define the expected structure of the UAVariable objects and relevant properties
interface JsonUaNode {
    NodeId: string;
    DisplayName: string;
    BrowseName: string;
    References: {
        Reference: Reference[];
    }
    ParentNodeId?: string; // Not existent on all nodes (e.g. root node, or object types)
    [key: string]: any; // Allow other properties
}

interface Reference {
    ReferenceType: string;
    IsForward?: string;
    text: string;
}

interface JsonUAVariable extends JsonUaNode {
    Value?: any;
}

interface JsonUAObject extends JsonUaNode {
}

// Define the expected structure of the JSON object parsed from the XML file
interface UaNodesetJSON {
    UAVariable: JsonUAVariable[];
    UAObject: JsonUAObject[];
    UAObjectType: JsonUaNode[];
}

interface JsonNodeSet {
    UANodeSet: UaNodesetJSON;
}

export {UaNodesetJSON, JsonNodeSet, JsonUAVariable, JsonUAObject, JsonUaNode, Reference}