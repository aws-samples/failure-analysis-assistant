/**
 * Utility function to abstract pagination processing of AWS SDK
 * @param initialCommand Initial command
 * @param client AWS client
 * @param getItems Function to get items from response
 * @param getNextToken Function to get NextToken from response
 * @param setNextToken Function to set NextToken to command
 * @returns Array combining items from all pages
 */
export async function paginateResults<T, R>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialCommand: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  getItems: (response: R) => T[],
  getNextToken: (response: R) => string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setNextToken: (command: any, token: string) => any
): Promise<T[]> {
  const results: T[] = [];
  let nextToken: string | undefined;
  let command = initialCommand;
  
  do {
    const response = await client.send(command);
    const items = getItems(response);
    if (items) results.push(...items);
    nextToken = getNextToken(response);
    if (nextToken) command = setNextToken(command, nextToken);
  } while (nextToken);
  
  return results;
}

/**
 * Convert ISO8601 format date string to milliseconds
 * @param isoDate ISO8601 format date string
 * @returns Milliseconds
 */
export function iso8601ToMilliseconds(isoDate: string): number {
  const date = new Date(isoDate);
  return date.getTime();
}
