export interface ArtnetConfig {
    nodes: ArtnetNode[]
}

export interface ArtnetNode {
    name: string;
    address: string
    ip: string;
    universes: number[];
}