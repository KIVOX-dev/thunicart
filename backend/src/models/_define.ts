import mongoose, { type IndexOptions, type SchemaOptions } from 'mongoose';

export type Doc = Record<string, any>;
export type IndexSpec = [Record<string, 1 | -1 | 'text'>, IndexOptions?];

/**
 * Registers a model once. Indexes are declared in code beside the fields.
 * Models are loosely typed on purpose: services map documents to the shared DTO schemas,
 * and strict Mongoose generics make the type checker run out of memory on a schema this size.
 */
export function defineModel(
  name: string,
  collection: string,
  fields: Record<string, any>,
  indexes: IndexSpec[] = [],
  options: SchemaOptions = {},
): mongoose.Model<Doc> {
  const existing = mongoose.models[name];
  if (existing) return existing as mongoose.Model<Doc>;
  const schema = new mongoose.Schema<Doc>(fields as any, { collection, timestamps: true, versionKey: 'version', autoIndex: false, ...options } as any);
  for (const [spec, opts] of indexes) schema.index(spec as any, (opts ?? {}) as any);
  return mongoose.model<Doc>(name, schema);
}

/** Money fields are whole paise. */
export const paise = { type: Number, default: 0, validate: { validator: (v: unknown) => v === null || v === undefined || Number.isSafeInteger(v), message: 'Money must be whole paise' } };
export const oid = (ref: string, required = false): Record<string, any> => ({ type: mongoose.Schema.Types.ObjectId, ref, required });
