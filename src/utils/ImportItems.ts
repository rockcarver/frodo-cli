import { printError } from './Console';
import type { OperationRun } from './OperationRun';

/**
 * Decision record 0040 for the imports: the library's import functions try every
 * item of a parsed import file and throw ONE combined error that carries one
 * nested error per item that failed. This hands such a file to the library and
 * records the outcome of its items in an {@link OperationRun}, so that the items
 * that could be imported count as succeeded and each item that could not is
 * printed and named in the one summary of the command.
 *
 * Reading and parsing the file is not part of this: for the file that the
 * command line names, the caller fails the command whatever `--allow-failures`
 * says, and for the files of an `-A` import it records the file as a failure.
 * @param {OperationRun} run the run that tracks the items of the command
 * @param {unknown} data the parsed content of one import file
 * @param {object} settings structured and named parameters
 * @param {Function} settings.count how many items the file holds
 * @param {Function} settings.importItems calls the library to import all items of the file
 * @param {string} settings.fallbackName what to call the failure of an error that names no item, normally the file
 * @param {Function} settings.itemName Optional. The name to show for one nested error, or undefined to fall back to what `OperationRun` derives from it
 */
export async function importItemsOfFile<T>(
  run: OperationRun,
  data: T,
  {
    count,
    importItems,
    fallbackName,
    itemName,
  }: {
    count: (data: T) => number;
    importItems: (data: T) => Promise<unknown>;
    fallbackName: string;
    itemName?: (error: unknown) => string | undefined;
  }
): Promise<void> {
  let total = 1;
  try {
    // a file that does not hold what an import file holds is a failure too
    total = count(data);
    await importItems(data);
    for (let i = 0; i < total; i++) run.recordSuccess();
  } catch (error) {
    printError(error);
    run.recordCombinedError(error, { total, fallbackName, itemName });
  }
}
