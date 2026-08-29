import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, mongo } from 'mongoose';
import { Response } from 'express';

// Use the mongodb driver bundled WITH mongoose (mongoose.mongo) so GridFSBucket
// / ObjectId share the exact bson version the connection uses. Importing from
// the root `mongodb` package instead triggers "Unsupported BSON version".
const { GridFSBucket, ObjectId } = mongo;
type GridFSBucket = InstanceType<typeof mongo.GridFSBucket>;
type ObjectId = InstanceType<typeof mongo.ObjectId>;

/**
 * Stores uploaded files (currently only profile pictures) as GridFS objects in
 * the same MongoDB database as everything else, so they survive Render
 * redeploys (the container filesystem is ephemeral). Bucket name `uploads` →
 * `uploads.files` + `uploads.chunks` collections.
 */
@Injectable()
export class FilesService {
  private bucketRef: GridFSBucket | null = null;

  constructor(@InjectConnection() private readonly connection: Connection) {}

  private get bucket(): GridFSBucket {
    if (!this.bucketRef) {
      // connection.db is available once Mongoose has connected (guaranteed by
      // the time any request is served).
      this.bucketRef = new GridFSBucket(this.connection.db as any, {
        bucketName: 'uploads',
      });
    }
    return this.bucketRef;
  }

  /** Writes the buffer to GridFS and returns the new file's ObjectId hex string. */
  async upload(buffer: Buffer, filename: string, contentType: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // mongodb@7 dropped the top-level `contentType` option — it lives in
      // `metadata` now. We read it back from there (with a legacy fallback).
      const stream = this.bucket.openUploadStream(filename || 'upload', {
        metadata: { contentType: contentType || 'application/octet-stream' },
      });
      stream.on('error', reject);
      stream.on('finish', () => resolve(stream.id.toString()));
      stream.end(buffer);
    });
  }

  /** Streams a stored file to the HTTP response, or 404 if it doesn't exist. */
  async streamById(id: string, res: Response): Promise<void> {
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      throw new NotFoundException('File not found');
    }

    const fileDoc = await this.bucket.find({ _id: objectId }).next();
    if (!fileDoc) {
      throw new NotFoundException('File not found');
    }

    const contentType =
      (fileDoc as any).metadata?.contentType ||
      (fileDoc as any).contentType ||
      'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    if (typeof fileDoc.length === 'number') {
      res.setHeader('Content-Length', String(fileDoc.length));
    }
    // Ids are content-stable (a new upload gets a new id), so cache hard.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const download = this.bucket.openDownloadStream(objectId);
    download.on('error', () => {
      if (!res.headersSent) {
        res.status(404).json({ message: 'File not found' });
      } else {
        res.end();
      }
    });
    download.pipe(res);
  }

  /** Best-effort delete — used when a user replaces their avatar. */
  async deleteById(id: string): Promise<void> {
    try {
      await this.bucket.delete(new ObjectId(id));
    } catch {
      // FileNotFound / bad id — nothing to do.
    }
  }
}
