import { PrismaClient, Role, ProjectType } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

/** Same hashing scheme used by the auth package (scrypt, salt:hash hex). */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  const email = "demo@synapse.dev";
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Demo User",
      passwordHash: hashPassword("password123"),
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Demo Workspace",
      slug: "demo",
      ownerId: user.id,
      memberships: {
        create: { userId: user.id, role: Role.OWNER },
      },
    },
  });

  const project = await prisma.project.upsert({
    where: { id: "seed-project" },
    update: {},
    create: {
      id: "seed-project",
      name: "Getting Started",
      type: ProjectType.BOARD,
      workspaceId: workspace.id,
    },
  });

  // Seed a usable Kanban board (idempotent: only when the board is still empty).
  const existingColumns = await prisma.boardColumn.count({ where: { projectId: project.id } });
  if (existingColumns === 0) {
    const names = ["To Do", "In Progress", "Done"];
    const columns = await Promise.all(
      names.map((name, position) =>
        prisma.boardColumn.create({ data: { projectId: project.id, name, position } }),
      ),
    );
    const cards: [number, string][] = [
      [0, "Welcome to your board"],
      [0, "Drag me to another column"],
      [1, "Realtime presence (Faz 2C)"],
      [2, "Set up the monorepo"],
    ];
    await Promise.all(
      cards.map(([col, title], i) =>
        prisma.card.create({
          data: {
            projectId: project.id,
            columnId: columns[col]!.id,
            title,
            position: i,
            createdById: user.id,
          },
        }),
      ),
    );
  }

  // Default label palette for the demo board (idempotent).
  const existingLabels = await prisma.label.count({ where: { projectId: project.id } });
  if (existingLabels === 0) {
    await prisma.label.createMany({
      data: [
        { projectId: project.id, name: "Bug", color: "#ef4444" },
        { projectId: project.id, name: "Feature", color: "#10b981" },
        { projectId: project.id, name: "Urgent", color: "#f59e0b" },
        { projectId: project.id, name: "Docs", color: "#3b82f6" },
      ],
    });
  }

  // A collaborative document project (Faz 3) for the demo workspace.
  await prisma.project.upsert({
    where: { id: "seed-doc" },
    update: {},
    create: {
      id: "seed-doc",
      name: "Team Notes",
      type: ProjectType.DOC,
      workspaceId: workspace.id,
    },
  });

  // A collaborative whiteboard project (Faz 4).
  await prisma.project.upsert({
    where: { id: "seed-canvas" },
    update: {},
    create: {
      id: "seed-canvas",
      name: "Brainstorm Canvas",
      type: ProjectType.CANVAS,
      workspaceId: workspace.id,
    },
  });

  console.log(
    `Seeded user ${email} (password: password123) + workspace "demo" + board + doc + canvas.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
