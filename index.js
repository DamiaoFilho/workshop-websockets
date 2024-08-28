import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
async function main() {
  const db = await open({
    filename: 'chat.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_offset TEXT UNIQUE,
        content TEXT
    );
  `);
  
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    connectionStateRecovery: {
      maxDisconnectionDuration: 180000,
    },
  });
  
  const __dirname = dirname(fileURLToPath(import.meta.url));
  
  io.on("connection", async (socket) => {
    if (socket.recovered) {
      console.log("eita, recuperei");
    }
  
    socket.on("send message", async (msg, client_offset, callback) => {
      let result;
      try {
        result = await db.run('INSERT INTO messages (content, client_offset) VALUES (?, ?)', msg, client_offset);
        io.emit('send message', msg, result.lastID);
        callback();
      } catch (e) {
        if (e.errno === 19) {
          callback();
        }else{
          console.error("Nothing to do");
        }
      }
    });
  
    socket.on("disconnect", () => {
      console.log("user disconnected");
    });

    
    if (!socket.recovered) {
      try {
        await db.each('SELECT id, content FROM messages WHERE id > ?',
          [socket.handshake.auth.serverOffset || 0],
          (_err, row) => {
            socket.emit('send message', row.content, row.id);
          }
        )
      } catch (e) {
        console.error(e);
      }
    }
  });
  
  app.get("/", (req, res) => {
    res.sendFile(join(__dirname, "index.html"));
  });
  
  server.listen(3000, () => console.log("running at port 3000"));
}

main();