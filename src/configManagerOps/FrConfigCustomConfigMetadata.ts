import { frodo } from '@rockcarver/frodo-lib';
import { verboseMessage, printMessage } from '../utils/Console';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { config:  idmConfig } = frodo.idm;

export async function getConfigMetadata(save: boolean) : Promise<boolean>{
    const configMetadataObject = await idmConfig.readConfigEntity('custom/config.metadata');
    printMessage(configMetadataObject);
    if(save){
        verboseMessage('Also saving to file');
        saveJsonToFile(configMetadataObject, getFilePath(`custom-config-metadata/config.metadata.json`, true), false);
    }
    return true;
}