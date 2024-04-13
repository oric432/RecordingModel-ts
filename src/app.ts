import httpServer from "./connections_servers.js";

httpServer.listen(3005, "127.0.0.1", () => {
    console.log("server is listening");
});

process.on("SIGINT", () => {
    console.log("Received SIGINT. Shutting down gracefully...");
    httpServer.close(() => {
        console.log("Server closed.");
        process.exit(0);
    });
});
