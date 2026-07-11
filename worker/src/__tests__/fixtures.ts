/**
 * Test fixtures for dependency injection.
 *
 * Provides a Fetcher implementation that records all requests and responses
 * for test assertions, without making real network calls.
 */

import { Fetcher } from '../types';

export interface RecordedFetch {
  input: RequestInfo;
  init?: RequestInit;
  response: Response;
  timestamp: number;
}

/**
 * A Fetcher that records every call and returns a pre-configured response.
 * Use in tests to verify that services make the expected HTTP requests
 * without actually hitting the network.
 */
export class FixtureFetcher implements Fetcher {
  private recordings: RecordedFetch[] = [];
  private responseFactory: (input: RequestInfo, init?: RequestInit) => Response;

  constructor(
    responseFactory: (input: RequestInfo, init?: RequestInit) => Response = () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) {
    this.responseFactory = responseFactory;
  }

  fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const response = this.responseFactory(input, init);
    this.recordings.push({
      input,
      init,
      response: response.clone(),
      timestamp: Date.now(),
    });
    return Promise.resolve(response);
  }

  /** Return all recorded fetch calls for assertions. */
  getRecordings(): ReadonlyArray<RecordedFetch> {
    return this.recordings;
  }

  /** Clear the recording history. */
  reset(): void {
    this.recordings = [];
  }
}

/**
 * A Fetcher that wraps the global `fetch` for production use.
 * This is the default injected into services at runtime.
 */
export const globalFetcher: Fetcher = { fetch };

/**
 * A Fetcher that always returns the given static response.
 * Convenience factory for simple test scenarios.
 */
export function staticFetcher(
  status: number,
  body: string = '',
  contentType: string = 'application/json',
): Fetcher {
  return new FixtureFetcher(() => new Response(body, { status, headers: { 'Content-Type': contentType } }));
}