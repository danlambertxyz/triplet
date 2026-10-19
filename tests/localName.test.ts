import { describe, expect, it } from 'vitest';
import { toLocalName } from '../src/core/localName';

describe('toLocalName (ID-06)', () => {
  it.each([
    ['Acme Bank', 'entity', 'AcmeBank'],
    ['works for', 'predicate', 'worksFor'],
    ['Client ID', 'entity', 'ClientID'],
    ['KYC Risk Rating', 'entity', 'KYCRiskRating'],
    ['CUST_ID', 'entity', 'CUST_ID'],
    ['Address Line 1', 'entity', 'AddressLine1'],
    ['contains PII', 'predicate', 'containsPII'],
    ['Tax ID Number', 'entity', 'TaxIDNumber'],
    ['Individual Client 360', 'entity', 'IndividualClient360'],
    ['has physical data element', 'predicate', 'hasPhysicalDataElement'],
    ['Physical data element', 'entity', 'PhysicalDataElement'],
    ['date of birth', 'entity', 'DateOfBirth'],
    ['Date of Birth', 'entity', 'DateOfBirth'],
  ] as const)('%s (%s) → %s', (typed, kind, expected) => {
    expect(toLocalName(typed, kind)).toBe(expected);
  });

  it('splits at punctuation other than underscore', () => {
    expect(toLocalName("client's e-mail/address", 'entity')).toBe('ClientSEMailAddress');
    expect(toLocalName('first_name (legal)', 'predicate')).toBe('first_nameLegal');
  });

  it('trims surrounding whitespace and collapses repeated separators', () => {
    expect(toLocalName('  Core   Banking  ', 'entity')).toBe('CoreBanking');
  });

  it('keeps non-ASCII letters', () => {
    expect(toLocalName('café menu', 'entity')).toBe('CaféMenu');
  });

  it('returns an empty string when nothing usable was typed', () => {
    expect(toLocalName(' -- ', 'entity')).toBe('');
  });
});
