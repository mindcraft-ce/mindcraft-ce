import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function atomicWriteFile(filePath, data, options = 'utf8') {
    const directory = path.dirname(filePath);
    const basename = path.basename(filePath);
    const tempPath = path.join(directory, `.${basename}.${process.pid}.${randomUUID()}.tmp`);

    await fs.mkdir(directory, { recursive: true });
    try {
        await fs.writeFile(tempPath, data, options);
        await fs.rename(tempPath, filePath);
    } catch (error) {
        try {
            await fs.unlink(tempPath);
        } catch {
            // Best-effort cleanup when the temp file was never created or was already renamed.
        }
        throw error;
    }
}

export async function atomicWriteJson(filePath, value, spacing = 2) {
    await atomicWriteFile(filePath, JSON.stringify(value, null, spacing), 'utf8');
}

export async function settleAll(work) {
    const pending = Array.from(work ?? []);
    const results = await Promise.allSettled(pending);
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
        throw new AggregateError(failures.map(result => result.reason), 'One or more shutdown operations failed.');
    }
    return results.map(result => result.value);
}
