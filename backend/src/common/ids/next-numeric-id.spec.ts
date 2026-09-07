import { createWithNumericId } from './next-numeric-id';

/** Minimal stand-in for a Mongoose Model — only `create` is used. */
function modelWith(create: jest.Mock): any {
  return { create };
}

function duplicateNumericIdError() {
  return Object.assign(new Error('E11000 duplicate key error collection: test index: numericId_1'), {
    code: 11000,
    keyPattern: { numericId: 1 },
    keyValue: { numericId: 42 },
  });
}

describe('createWithNumericId', () => {
  it('creates on the first attempt without touching numericId', async () => {
    const create = jest.fn().mockResolvedValue({ ok: true });
    const model = modelWith(create);

    const result = await createWithNumericId(model, { name: 'x' });

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(1);
    // First attempt must let the schema's pre('save') hook derive the id,
    // preserving the existing behaviour for every collection.
    expect(create).toHaveBeenCalledWith({ name: 'x' });
  });

  it('retries with an explicit id after a numericId collision', async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(duplicateNumericIdError())
      .mockResolvedValue({ ok: true });
    const model = modelWith(create);

    const result = await createWithNumericId(model, { name: 'x' });

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(2);
    const secondArg = create.mock.calls[1][0];
    expect(secondArg.name).toBe('x');
    expect(typeof secondArg.numericId).toBe('number');
    expect(secondArg.numericId).toBeGreaterThanOrEqual(0);
    expect(secondArg.numericId).toBeLessThan(100000);
  });

  it('rethrows a duplicate-key error on a DIFFERENT field untouched', async () => {
    // A unique busNumber collision must keep reaching the existing handler in
    // BusesService rather than being retried as an id collision.
    const busNumberError = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
      keyPattern: { busNumber: 1 },
      keyValue: { busNumber: 'B-1' },
    });
    const create = jest.fn().mockRejectedValue(busNumberError);

    await expect(createWithNumericId(modelWith(create), { busNumber: 'B-1' })).rejects.toBe(
      busNumberError,
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-duplicate errors immediately', async () => {
    const boom = new Error('connection lost');
    const create = jest.fn().mockRejectedValue(boom);

    await expect(createWithNumericId(modelWith(create), {})).rejects.toBe(boom);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempt limit and throws the last error', async () => {
    const create = jest.fn().mockRejectedValue(duplicateNumericIdError());

    await expect(createWithNumericId(modelWith(create), {}, 3)).rejects.toMatchObject({
      code: 11000,
    });
    expect(create).toHaveBeenCalledTimes(3);
  });
});
