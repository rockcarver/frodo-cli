import {
  ACCESS_MATRIX_DOC,
  accessNoticeLines,
  accessProfileLines,
  groupAreas,
  isInteractiveFlow,
  sessionAdviceLine,
  sessionText,
} from '../../src/utils/AccessProfileText.ts';
import {
  browserProfile,
  deviceProfile,
  profileOfSession,
  reducedBrowserProfile,
  serviceAccountProfile,
} from '../utils/AccessProfileFixtures.js';

// The words about what a login can do come from the access profile of the
// library (a real session of each kind, see AccessProfileFixtures): the
// browser login, the device login without Access Management, and a login that
// was granted fewer scopes than it asked for.

const text = (lines) => lines.join('\n');
// the lists wrap at 100 columns: look at the words, not at where the lines break
const flat = (lines) => lines.join(' ').replace(/\s+/g, ' ');

describe('what a new login can do, in words', () => {
  test('1: a browser login names itself, the client, the session and what it reaches', () => {
    const lines = accessNoticeLines(browserProfile());
    expect(lines[0]).toBe('What this browser login can do:');
    const body = text(lines);
    expect(body).toMatch(/Login: +browser login, client AICMCPClient/);
    expect(body).toMatch(
      /Session: +ends in about 29 minutes, cannot be refreshed: log in again when it ends/
    );
    expect(body).toMatch(
      /Can reach: +Access Management, Identity Management, Environment secrets and variables/
    );
    expect(flat(lines)).toContain('Governance');
    expect(flat(lines)).toContain('(need a service account)');
    expect(lines.at(-1)).toBe(`More: ${ACCESS_MATRIX_DOC}`);
  });

  test('2: a device login says that Access Management is not available and how to get it, and what the library adapted', () => {
    const body = text(accessNoticeLines(deviceProfile()));
    expect(body).toContain('What this device login can do:');
    expect(body).toMatch(
      /Can reach: +Identity Management, Environment secrets/
    );
    expect(body).toMatch(
      /Cannot reach: +Access Management \(need a browser login or a service account\)/
    );
    expect(body).toMatch(/Adapted: +The scope fr:am:\* was not requested/);
  });

  test('3: a login that was granted fewer scopes than it asked for lists the area as not requested', () => {
    const body = text(accessNoticeLines(reducedBrowserProfile()));
    expect(body).toMatch(
      /Can reach: +Access Management, Identity Management$/m
    );
    expect(flat(accessNoticeLines(reducedBrowserProfile()))).toContain(
      'Environment secrets and variables (not requested by this login)'
    );
  });

  test('4: an area that the library cannot tell about is listed as not known, not as reachable or not', () => {
    const profile = browserProfile();
    profile.areas.find((area) => area.id === 'esv').reachable = 'unknown';
    const groups = groupAreas(profile);
    expect(groups.notKnown).toEqual(['Environment secrets and variables']);
    expect(groups.canReach).not.toContain('Environment secrets and variables');
    expect(text(accessProfileLines(profile))).toMatch(
      /Not known: +Environment secrets and variables/
    );
  });

  test('5: a partly reachable area is marked as such', () => {
    const profile = browserProfile();
    profile.areas.find((area) => area.id === 'esv').reachable = 'partial';
    expect(groupAreas(profile).canReach).toContain(
      'Environment secrets and variables (partly)'
    );
  });

  test('6: a session that can be refreshed says so', () => {
    const profile = profileOfSession({ flow: 'browser', refresh: true });
    expect(sessionText(profile, Date.now())).toMatch(
      /is refreshed automatically$/
    );
  });

  test('7: the length of the session is measured from now', () => {
    const profile = browserProfile();
    expect(sessionText(profile, profile.expiresAt - 60_000)).toMatch(
      /^ends in about a minute,/
    );
    expect(sessionText(profile, profile.expiresAt - 90 * 60_000)).toMatch(
      /^ends in about 90 minutes,/
    );
    expect(sessionText(profile, profile.expiresAt + 1000)).toMatch(
      /^has ended,/
    );
    expect(sessionText({ ...profile, expiresAt: undefined })).toMatch(
      /^end of the session unknown,/
    );
  });

  test('8: no line is longer than 100 columns, apart from the link', () => {
    for (const profile of [
      browserProfile(),
      deviceProfile(),
      reducedBrowserProfile(),
    ]) {
      for (const line of accessProfileLines(profile)) {
        expect(line.length).toBeLessThanOrEqual(100);
      }
    }
  });

  test('9: a service account is not an interactive login, and its areas are not "need a service account"', () => {
    const profile = serviceAccountProfile();
    expect(isInteractiveFlow(profile.flow)).toBe(false);
    expect(flat(accessProfileLines(profile))).toContain(
      '(not granted to this credential)'
    );
    expect(flat(accessProfileLines(profile))).not.toContain(
      'need a service account'
    );
  });
});

describe('the advice that follows a scope error', () => {
  test('10: a browser login: names the login, what it reaches, and a service account', () => {
    const line = sessionAdviceLine(browserProfile());
    expect(line).toMatch(
      /^This session is a browser login \(it reaches Access/
    );
    expect(line).toContain('use a service account');
    expect(line).toContain(ACCESS_MATRIX_DOC);
  });

  test('11: a device login without Access Management: also names the browser login', () => {
    const line = sessionAdviceLine(deviceProfile());
    expect(line).toMatch(/^This session is a device login/);
    expect(line).toContain("a browser login ('frodo login --browser')");
    expect(line).toContain('or a service account');
    expect(line).not.toMatch(/it reaches Access Management/);
  });

  test('12: a service account gets no line: its scopes are the answer', () => {
    expect(sessionAdviceLine(serviceAccountProfile())).toBeUndefined();
  });
});
