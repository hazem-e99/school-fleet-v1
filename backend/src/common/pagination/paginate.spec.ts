import { parsePagination, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './paginate';

describe('parsePagination', () => {
  it('defaults to page 1 with the default page size', () => {
    expect(parsePagination(undefined, undefined)).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
    });
  });

  it('parses query strings', () => {
    expect(parsePagination('3', '10')).toEqual({ page: 3, pageSize: 10, skip: 20 });
  });

  it('accepts numbers as well as strings', () => {
    expect(parsePagination(2, 5)).toEqual({ page: 2, pageSize: 5, skip: 5 });
  });

  it('caps pageSize so a client cannot request the whole collection', () => {
    expect(parsePagination('1', '100000').pageSize).toBe(MAX_PAGE_SIZE);
  });

  it('coerces junk and out-of-range values to safe defaults', () => {
    expect(parsePagination('abc', 'xyz')).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
    });
    expect(parsePagination('0', '0')).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
    });
    expect(parsePagination('-5', '-5')).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
    });
  });

  it('floors fractional input', () => {
    expect(parsePagination('2.9', '10.7')).toEqual({ page: 2, pageSize: 10, skip: 10 });
  });
});
