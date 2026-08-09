import { McpLogger } from '../../src/ops/McpLogger.ts';

describe('McpLogger', () => {
  test('applies the default info threshold', () => {
    const records = [];
    const logger = new McpLogger();

    logger.debug('hidden', 'debug message');
    logger.info('visible', 'info message');
    logger.attachSink((record) => records.push(record));

    expect(records).toEqual([
      { level: 'info', data: 'visible: info message' },
    ]);
  });

  test('off suppresses every level', () => {
    const records = [];
    const logger = new McpLogger('off');

    logger.error('error', 'message');
    logger.attachSink((record) => records.push(record));

    expect(records).toEqual([]);
  });

  test('maps warn to the MCP warning level', () => {
    const records = [];
    const logger = new McpLogger('warn');

    logger.warn('event', 'message');
    logger.attachSink((record) => records.push(record));

    expect(records).toEqual([{ level: 'warning', data: 'event: message' }]);
  });

  test('bounds the startup buffer and evicts debug records first', () => {
    const records = [];
    const logger = new McpLogger('debug', 2);

    logger.debug('debug', 'first');
    logger.info('info', 'second');
    logger.error('error', 'third');
    logger.attachSink((record) => records.push(record));

    expect(records).toEqual([
      { level: 'info', data: 'info: second' },
      { level: 'error', data: 'error: third' },
    ]);
  });

  test('drops startup records when buffering is disabled', () => {
    const records = [];
    const logger = new McpLogger('info', 0);

    logger.info('event', 'message');
    logger.attachSink((record) => records.push(record));

    expect(records).toEqual([]);
  });

  test('truncates messages to the configured bound', () => {
    const records = [];
    const logger = new McpLogger('info', 100, 12);

    logger.info('event', 'a long message');
    logger.attachSink((record) => records.push(record));

    expect(records).toEqual([{ level: 'info', data: 'event: a lon' }]);
  });

  test('flushes buffered records once and sends new records to the sink', () => {
    const firstSinkRecords = [];
    const secondSinkRecords = [];
    const logger = new McpLogger();

    logger.info('buffered', 'message');
    logger.attachSink((record) => firstSinkRecords.push(record));
    logger.attachSink((record) => secondSinkRecords.push(record));
    logger.info('live', 'message');

    expect(firstSinkRecords).toEqual([
      { level: 'info', data: 'buffered: message' },
    ]);
    expect(secondSinkRecords).toEqual([
      { level: 'info', data: 'live: message' },
    ]);
  });

  test('isolates synchronous and asynchronous sink failures', async () => {
    const logger = new McpLogger();

    logger.attachSink(() => {
      throw new Error('sync failure');
    });
    expect(() => logger.info('sync', 'message')).not.toThrow();

    logger.attachSink(() => Promise.reject(new Error('async failure')));
    logger.info('async', 'message');
    await new Promise((resolve) => setImmediate(resolve));
  });

  test('formats discovery summaries and ranked candidate details', () => {
    const records = [];
    const logger = new McpLogger();

    logger.trace(
      {
        event: 'tool.completed',
        toolName: 'frodo_find_skills',
        criteria: {
          query: 'journey',
          domain: 'authn',
          objectType: 'Journey Type',
          skillIdPrefix: 'authn.journey',
          operationTypes: [
            'read',
            'list',
            'count',
            'export',
            'import',
            'create',
          ],
          riskClasses: ['low', 'medium'],
          kind: 'generic',
          limit: 7,
        },
        candidateCount: 2,
        resultCount: 2,
        elapsedMs: 4,
        topCandidates: [
          { skillId: 'alpha', routingStatus: 'preferred' },
          { skillId: 'beta', routingStatus: 'compatible' },
        ],
      },
      (record) => records.push(record)
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      level: 'info',
      data: 'tool.completed: tool=frodo_find_skills criteria=[query="journey" domain=authn objectType="Journey Type" skillIdPrefix=authn.journey operations=[read,list,count,export,import,+1] risks=[low,medium] kind=generic limit=7] candidates=2 results=2 topCandidates=[alpha(preferred), beta(compatible)] elapsedMs=4',
    });
  });
});