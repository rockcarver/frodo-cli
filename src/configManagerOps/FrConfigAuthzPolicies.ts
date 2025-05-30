import { frodo } from '@rockcarver/frodo-lib';
import { PolicySetSkeleton, getPolicySets as _getPolicySets } from '@rockcarver/frodo-lib/types/api/PolicySetApi';
import {
    createProgressIndicator,
    debugMessage,
    printError,
    stopProgressIndicator,
    updateProgressIndicator,
} from '../utils/Console';

const { getFilePath, saveJsonToFile } = frodo.utils;

export async function exportAuthzPoliciesToFiles():Promise<boolean> {
    // if verbose is on, show steps of saving thingy.
    // alpha folder exists? yes? then no need to make new folder. It doesn't? make new folder
    // default options should export all policies of all realms
    // default is specify all policies from all policiy sets from all realms
    // if realm is specified, all sets and policies from just that realm
    // if realm and set are specified, just that
    // need to through an error if there is a realm specified and a policyset that doesn't exist in that realm
    return true;
}