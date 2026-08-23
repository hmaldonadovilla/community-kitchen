import { isValidEmailAddress, parseEmailAddressList } from '../../src/domain/emailAddresses';

const cloudRunEmailAddresses = require('../../cloud-run/api/domain/emailAddresses');

describe.each([
  ['Apps Script/web', { isValidEmailAddress, parseEmailAddressList }],
  ['Cloud Run', cloudRunEmailAddresses]
])('%s email address domain rules', (_runtime, rules) => {
  test('accepts one address and normalizes comma-separated lists', () => {
    expect(rules.parseEmailAddressList('primary@example.org')).toMatchObject({
      valid: true,
      addresses: ['primary@example.org']
    });
    expect(rules.parseEmailAddressList('primary@example.org, Second@Example.ORG')).toMatchObject({
      valid: true,
      addresses: ['primary@example.org', 'Second@example.org'],
      normalized: 'primary@example.org, Second@example.org'
    });
  });

  test.each([
    'primary@example.org second@example.org',
    'primary@example.org;second@example.org',
    'primary@example.org,',
    'primary@example.org,,second@example.org',
    'missing-domain@',
    '@missing-local.example.org',
    'Name <primary@example.org>'
  ])('rejects malformed list value %s', value => {
    expect(rules.parseEmailAddressList(value).valid).toBe(false);
  });

  test('rejects multiple addresses when the rule requires one', () => {
    expect(
      rules.parseEmailAddressList('primary@example.org, second@example.org', { allowMultiple: false }).valid
    ).toBe(false);
  });

  test('deduplicates addresses case-insensitively', () => {
    expect(rules.parseEmailAddressList('Primary@Example.org, primary@example.ORG').addresses).toEqual([
      'Primary@example.org'
    ]);
  });
});
