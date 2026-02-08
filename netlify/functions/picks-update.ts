import type { Handler } from "@netlify/functions";
import { z } from "zod";
import { storage } from "../../server/storage";
import { api } from "../../shared/routes";

const handler: Handler = async (event) => {
  if (event.httpMethod !== "PATCH") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  }

  const pickId = event.queryStringParameters?.pickId;
  const id = pickId ? parseInt(pickId, 10) : NaN;
  if (!pickId || isNaN(id)) {
    return { statusCode: 400, body: JSON.stringify({ message: "Missing or invalid pick ID" }) };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const input = api.picks.update.input.parse(body);
    const updated = await storage.updatePick(id, input);

    if (!updated) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Pick not found" }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: err.errors[0]?.message || "Validation error" }),
      };
    }
    console.error("Error updating pick:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

export { handler };
