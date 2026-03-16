/**
 * SQL.js Database Adapter
 * Drop-in replacement for better-sqlite3 with sql.js (pure JS, no native deps)
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

let SQL: any = null;

async function initSql() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

export class Database {
  private db: SqlJsDatabase | null = null;
  private filepath: string;
  private isReady = false;

  constructor(filepath: string, options?: any) {
    this.filepath = filepath;
    this.init();
  }

  private async init() {
    const SQL = await initSql();

    if (existsSync(this.filepath)) {
      const buffer = readFileSync(this.filepath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    this.isReady = true;
  }

  prepare(sql: string) {
    if (!this.db || !this.isReady) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(sql);

    return {
      run: (...params: any[]) => {
        stmt.bind(params);
        stmt.step();
        stmt.reset();
        return {
          changes: this.db!.getRowsModified(),
          lastInsertRowid: this.db!.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] || 0
        };
      },
      get: (...params: any[]) => {
        stmt.bind(params);
        const result = stmt.step() ? stmt.getAsObject() : undefined;
        stmt.reset();
        return result;
      },
      all: (...params: any[]) => {
        stmt.bind(params);
        const results: any[] = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.reset();
        return results;
      }
    };
  }

  exec(sql: string) {
    if (!this.db || !this.isReady) {
      throw new Error('Database not initialized');
    }
    this.db.run(sql);
    return this;
  }

  close() {
    if (this.db) {
      // Save database to file
      const data = this.db.export();
      const buffer = Buffer.from(data);
      writeFileSync(this.filepath, buffer);

      this.db.close();
      this.db = null;
    }
  }

  pragma(pragma: string, options?: any): any {
    // sql.js doesn't support PRAGMAs the same way
    // Return sensible defaults
    return null;
  }
}

export default Database;
export { Database as DatabaseInstance };
