import type { McpToolRuntimeTraceEvent } from '@rockcarver/frodo-lib';
import winston from 'winston';
import Transport from 'winston-transport';

export const MCP_LOG_LEVELS = [
  'off',
  'error',
  'warn',
  'info',
  'debug',
] as const;

export type McpLogLevel = (typeof MCP_LOG_LEVELS)[number];
export type McpProtocolLogLevel = 'error' | 'warning' | 'info' | 'debug';

export type McpLogRecord = {
  level: McpProtocolLogLevel;
  data: string;
};

export type McpLogSink = (record: McpLogRecord) => void | Promise<void>;

type InternalMcpLogRecord = McpLogRecord & {
  mcpSink?: McpLogSink;
};

const DEFAULT_BUFFER_SIZE = 100;
const DEFAULT_MESSAGE_LENGTH = 2048;
const MAX_CRITERIA_LIST_VALUES = 5;

class McpProtocolTransport extends Transport {
  constructor(
    private readonly dispatch: (record: InternalMcpLogRecord) => void
  ) {
    super();
  }

  override log(
    info: { level: string; message: unknown; mcpSink?: McpLogSink },
    callback: () => void
  ): void {
    setImmediate(() => this.emit('logged', info));
    this.dispatch({
      level: toProtocolLevel(info.level),
      data: String(info.message),
      mcpSink: info.mcpSink,
    });
    callback();
  }
}

export class McpLogger {
  private readonly logger: winston.Logger;
  private readonly buffer: McpLogRecord[] = [];
  private sink?: McpLogSink;

  constructor(
    readonly level: McpLogLevel = 'info',
    private readonly maxBufferSize = DEFAULT_BUFFER_SIZE,
    private readonly maxMessageLength = DEFAULT_MESSAGE_LENGTH
  ) {
    this.logger = winston.createLogger({
      level: level === 'off' ? 'error' : level,
      silent: level === 'off',
      format: winston.format.printf(({ message }) => String(message)),
      transports: [new McpProtocolTransport((record) => this.dispatch(record))],
    });
  }

  error(event: string, message: string): void {
    this.write('error', event, message);
  }

  warn(event: string, message: string): void {
    this.write('warn', event, message);
  }

  info(event: string, message: string): void {
    this.write('info', event, message);
  }

  debug(event: string, message: string): void {
    this.write('debug', event, message);
  }

  trace(event: McpToolRuntimeTraceEvent, sink: McpLogSink): void {
    this.write('info', event.event, formatTraceSummary(event), sink);
  }

  attachSink(sink: McpLogSink): void {
    this.sink = sink;
    const records = this.buffer.splice(0);
    for (const record of records) {
      this.emit(record, sink);
    }
  }

  private write(
    level: Exclude<McpLogLevel, 'off'>,
    event: string,
    message: string,
    sink?: McpLogSink
  ): void {
    this.logger.log(level, formatMessage(event, message), { mcpSink: sink });
  }

  private dispatch(record: InternalMcpLogRecord): void {
    const boundedRecord = {
      level: record.level,
      data: record.data.slice(0, this.maxMessageLength),
    };
    const sink = record.mcpSink ?? this.sink;
    if (sink) {
      this.emit(boundedRecord, sink);
      return;
    }

    if (this.maxBufferSize <= 0) {
      return;
    }
    if (this.buffer.length >= this.maxBufferSize) {
      const debugIndex = this.buffer.findIndex(
        (entry) => entry.level === 'debug'
      );
      this.buffer.splice(debugIndex >= 0 ? debugIndex : 0, 1);
    }
    this.buffer.push(boundedRecord);
  }

  private emit(record: McpLogRecord, sink: McpLogSink): void {
    try {
      void Promise.resolve(sink(record)).catch(() => undefined);
    } catch {
      // Logging must never alter MCP tool behavior.
    }
  }
}

function formatMessage(event: string, message: string): string {
  return `${event}: ${message}`;
}

function formatTraceSummary(event: McpToolRuntimeTraceEvent): string {
  const fields = [
    `tool=${event.toolName}`,
    event.descriptorId && `skill=${event.descriptorId}`,
    event.deploymentType && `deployment=${event.deploymentType}`,
    formatDiscoveryCriteria(event.criteria),
    event.candidateCount !== undefined && `candidates=${event.candidateCount}`,
    event.resultCount !== undefined && `results=${event.resultCount}`,
    event.topCandidates?.length &&
      `topCandidates=[${event.topCandidates
        .map(
          (candidate) =>
            `${candidate.skillId}(${candidate.routingStatus}${
              candidate.matchedObjectTypeCount !== undefined
                ? `;matchedTypes=${candidate.matchedObjectTypeCount}`
                : ''
            })`
        )
        .join(', ')}]`,
    event.routingReason && `reason=${event.routingReason}`,
    event.elapsedMs !== undefined && `elapsedMs=${event.elapsedMs}`,
    event.error && `error=${event.error}`,
    event.requestId && `requestId=${event.requestId}`,
  ].filter(Boolean);
  return fields.join(' ');
}

function formatDiscoveryCriteria(
  criteria?: NonNullable<McpToolRuntimeTraceEvent['criteria']>
): string | undefined {
  if (!criteria) return undefined;

  const fields = [
    criteria.query !== undefined && `query=${JSON.stringify(criteria.query)}`,
    criteria.domain !== undefined &&
      `domain=${formatCriteriaValue(criteria.domain)}`,
    criteria.objectType !== undefined &&
      `objectType=${formatCriteriaValue(criteria.objectType)}`,
    criteria.skillIdPrefix !== undefined &&
      `skillIdPrefix=${formatCriteriaValue(criteria.skillIdPrefix)}`,
    criteria.operationTypes?.length &&
      `operations=${formatCriteriaList(criteria.operationTypes)}`,
    criteria.riskClasses?.length &&
      `risks=${formatCriteriaList(criteria.riskClasses)}`,
    criteria.kind !== undefined && `kind=${criteria.kind}`,
    criteria.limit !== undefined && `limit=${criteria.limit}`,
  ].filter(Boolean);
  return fields.length > 0 ? `criteria=[${fields.join(' ')}]` : undefined;
}

function formatCriteriaList(values: readonly string[]): string {
  const displayed = values
    .slice(0, MAX_CRITERIA_LIST_VALUES)
    .map(formatCriteriaValue);
  if (values.length > MAX_CRITERIA_LIST_VALUES) {
    displayed.push(`+${values.length - MAX_CRITERIA_LIST_VALUES}`);
  }
  return displayed.length === 1 ? displayed[0] : `[${displayed.join(',')}]`;
}

function formatCriteriaValue(value: string): string {
  return /^[A-Za-z0-9._*:/-]+$/.test(value) ? value : JSON.stringify(value);
}

function toProtocolLevel(level: string): McpProtocolLogLevel {
  return level === 'warn' ? 'warning' : (level as McpProtocolLogLevel);
}
