import "dotenv/config"; // Load .env file

export const config = {
	port: process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000,
	databaseUrl:
		process.env.DATABASE_URL ||
		"postgresql://user:password@localhost:5432/appointmentdb?schema=public",
	defaultTimezoneString: process.env.DEFAULT_TIMEZONE_STRING || "UTC",
	// Add other config variables as needed
};
