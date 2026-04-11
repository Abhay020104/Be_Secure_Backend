const path = require("path");
const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const buildSwaggerSpec = () =>
  swaggerJSDoc({
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Security Camera API",
        version: "1.0.0",
        description:
          "API for authentication, resident registration, emergency contacts, visitor handling, and identification alerts.",
      },
      servers: [
        {
          url: `http://localhost:${process.env.PORT || 5000}`,
          description: "Local server",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
        schemas: {
          UserRegisterInput: {
            type: "object",
            required: ["name", "email", "password"],
            properties: {
              name: { type: "string", example: "Control Room Admin" },
              email: { type: "string", format: "email", example: "admin@example.com" },
              password: { type: "string", example: "StrongPassword123" },
            },
          },
          UserLoginInput: {
            type: "object",
            required: ["email", "password"],
            properties: {
              email: { type: "string", format: "email", example: "admin@example.com" },
              password: { type: "string", example: "StrongPassword123" },
            },
          },
          ResidentInput: {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string", example: "Alice Sharma" },
              faceDescriptor: {
                type: "array",
                items: { type: "number" },
                example: [0.12, -0.34, 0.88, 0.44],
              },
              faceDescriptors: {
                type: "array",
                items: {
                  type: "array",
                  items: { type: "number" },
                },
                example: [
                  [0.12, -0.34, 0.88, 0.44],
                  [0.11, -0.33, 0.87, 0.43],
                ],
              },
              emergencyContacts: {
                type: "array",
                items: { type: "string" },
                example: ["+919999999999", "+918888888888"],
              },
            },
          },
          EmergencyContactInput: {
            type: "object",
            required: ["phoneNumber"],
            properties: {
              phoneNumber: { type: "string", example: "+919999999999" },
            },
          },
          EmergencyContactsReplaceInput: {
            type: "object",
            required: ["emergencyContacts"],
            properties: {
              emergencyContacts: {
                type: "array",
                items: { type: "string" },
                example: ["+919999999999", "+918888888888"],
              },
            },
          },
          IdentifyInput: {
            type: "object",
            required: ["descriptors"],
            properties: {
              descriptors: {
                type: "array",
                items: {
                  type: "array",
                  items: { type: "number" },
                },
                example: [
                  [0.12, -0.34, 0.88, 0.44],
                  [0.51, 0.01, -0.22, 0.63],
                ],
              },
              screenshotUrl: {
                type: "string",
                nullable: true,
                example: "https://example.com/frame-001.jpg",
              },
            },
          },
        },
      },
    },
    apis: [path.join(__dirname, "../routes/*.js")],
  });

const setupSwagger = (app) => {
  const swaggerSpec = buildSwaggerSpec();

  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api/docs.json", (req, res) => {
    res.json(swaggerSpec);
  });
};

module.exports = setupSwagger;
