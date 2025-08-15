import React from 'react';
import { SanityClient } from 'sanity';
export interface ConvertIdsToSlugsProps {
    client: SanityClient;
    documentTypes?: string[];
    onComplete?: (results: ConversionResult) => void;
    onError?: (error: string) => void;
    batchSize?: number;
    dryRun?: boolean;
    maxDocuments?: number;
}
export interface ConversionResult {
    converted: number;
    errors: string[];
    slugsGenerated: string[];
}
declare const ConvertIdsToSlugs: React.FC<ConvertIdsToSlugsProps>;
export default ConvertIdsToSlugs;
