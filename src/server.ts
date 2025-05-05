import "reflect-metadata";
import http from "node:http";
import { createApp } from "./app";
import { config } from "./config";

const app = createApp();
const server = http.createServer(app);

const PORT = config.port;

server.listen(PORT, () => {
	console.log(`🚀 Server running on http://localhost:${PORT}`);
	console.log(`📚 Database URL: ${config.databaseUrl.split("@")[1]}`); // Mask user/pass
});

// Optional: Handle server errors like EADDRINUSE
server.on("error", (error: NodeJS.ErrnoException) => {
	if (error.syscall !== "listen") {
		throw error;
	}
	switch (error.code) {
		case "EACCES":
			console.error(`Port ${PORT} requires elevated privileges`);
			process.exit(1);
			break;
		case "EADDRINUSE":
			console.error(`Port ${PORT} is already in use`);
			process.exit(1);
			break;
		default:
			throw error;
	}
});

// Handle graceful shutdown (server closing)
const gracefulShutdown = (signal: string) => {
	console.log(`${signal} signal received. Closing HTTP server...`);
	server.close(() => {
		console.log("HTTP server closed.");
		// Prisma disconnect is handled in app.ts via process events
		process.exit(0); // Exit after server closes
	});

	// Force close server after a timeout if it doesn't close gracefully
	setTimeout(() => {
		console.error(
			"Could not close connections in time, forcefully shutting down",
		);
		process.exit(1);
	}, 10000); // 10 seconds timeout
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
