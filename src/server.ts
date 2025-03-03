// server.ts
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

interface Point {
  x: number;
  y: number;
}

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

interface Player {
  id: string;
  snake: Point[];
  direction: Direction;
  score: number;
  color: string;
  directionQueue: Direction[];
  isAI?: boolean; // Flag to identify AI players
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://mentalkoolaid.com",
      "https://squid-app-c7598.ondigitalocean.app/",
    ],
    credentials: true,
  },
});

// --- Game Configuration ---
const GRID_WIDTH = 96;
const GRID_HEIGHT = 54;
const INITIAL_SNAKE_LENGTH = 3;
const TICK_RATE = 100; // in ms
const INITIAL_FRUIT_COUNT = 20;

// --- Game State ---
const players: Record<string, Player> = {};
const fruits: Point[] = [];
let gameLoopInterval: NodeJS.Timeout | null = null;

// --- Utility Functions ---
const getRandomInt = (max: number) => Math.floor(Math.random() * max);
const getRandomPosition = (): Point => ({
  x: getRandomInt(GRID_WIDTH),
  y: getRandomInt(GRID_HEIGHT),
});

// Generate vibrant colors with HSL
const generatePlayerColor = (): string => {
  const hue = Math.floor(Math.random() * 360); // Random hue (0-359)
  const saturation = 70 + Math.floor(Math.random() * 30); // High saturation (70-100%)
  const lightness = 50 + Math.floor(Math.random() * 20); // Moderate to high lightness (50-70%)
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

// Checks if a given point is occupied by any snake.
const isPositionOccupied = (pos: Point): boolean => {
  for (const id in players) {
    const player = players[id];
    if (
      player.snake.some((segment) => segment.x === pos.x && segment.y === pos.y)
    ) {
      return true;
    }
  }
  return false;
};

// Returns a "safe" spawn position (tries a few times).
const getSafeSpawnPosition = (): Point => {
  let pos = getRandomPosition();
  let attempts = 0;
  while (isPositionOccupied(pos) && attempts < 100) {
    pos = getRandomPosition();
    attempts++;
  }
  return pos;
};

// Creates a snake of length INITIAL_SNAKE_LENGTH starting at a position
// and extending in the opposite direction to the given one.
const createSnake = (start: Point, direction: Direction): Point[] => {
  const snake: Point[] = [];
  snake.push(start);
  for (let i = 1; i < INITIAL_SNAKE_LENGTH; i++) {
    let newSegment: Point;
    switch (direction) {
      case "RIGHT":
        newSegment = { x: start.x - i, y: start.y };
        break;
      case "LEFT":
        newSegment = { x: start.x + i, y: start.y };
        break;
      case "DOWN":
        newSegment = { x: start.x, y: start.y - i };
        break;
      case "UP":
      default:
        newSegment = { x: start.x, y: start.y + i };
        break;
    }
    snake.push(newSegment);
  }
  return snake;
};

// Spawn a new fruit at a random location with a random delay
const spawnFruit = () => {
  // if too many fruits on the board, don't spawn more
  if (fruits.length >= INITIAL_FRUIT_COUNT * 3) return;

  // Add random delay between 0-500ms for fruit spawning
  setTimeout(() => {
    const pos = getRandomPosition();
    fruits.push(pos);

    // make sure there are at least the number of fruits as players
    while (fruits.length < Object.keys(players).length) {
      const pos = getRandomPosition();
      fruits.push(pos);
    }
  }, Math.random() * 500);
};

// Initially spawn several fruits.
for (let i = 0; i < INITIAL_FRUIT_COUNT; i++) {
  spawnFruit();
}

// Helper: compare two points.
const pointsEqual = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

// Prevent reversing direction.
const isOpposite = (d1: Direction, d2: Direction): boolean =>
  (d1 === "UP" && d2 === "DOWN") ||
  (d1 === "DOWN" && d2 === "UP") ||
  (d1 === "LEFT" && d2 === "RIGHT") ||
  (d1 === "RIGHT" && d2 === "LEFT");

// Calculate Manhattan distance between two points
const manhattanDistance = (a: Point, b: Point): number => {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
};

// AI decision making function
const calculateAIMove = (playerId: string): Direction => {
  const player = players[playerId];
  if (!player) return "RIGHT"; // Default

  const head = player.snake[0];
  const currentDirection = player.direction;

  // Available directions (excluding opposite direction)
  const availableDirections: Direction[] = [
    "UP" as const,
    "DOWN" as const,
    "LEFT" as const,
    "RIGHT" as const,
  ].filter((dir) => !isOpposite(currentDirection, dir));

  // Calculate next positions for each direction
  const nextPositions: Record<Direction, Point> = {
    UP: { x: head.x, y: head.y - 1 },
    DOWN: { x: head.x, y: head.y + 1 },
    LEFT: { x: head.x - 1, y: head.y },
    RIGHT: { x: head.x + 1, y: head.y },
  };

  // Filter out directions that lead to immediate collisions
  const safeDirections = availableDirections.filter((dir) => {
    const pos = nextPositions[dir];

    // Check if out of bounds
    if (pos.x < 0 || pos.x >= GRID_WIDTH || pos.y < 0 || pos.y >= GRID_HEIGHT) {
      return false;
    }

    // Check if colliding with any snake
    for (const id in players) {
      const otherPlayer = players[id];
      const segments = otherPlayer.snake;

      if (segments.some((segment) => pointsEqual(segment, pos))) {
        return false;
      }
    }

    return true;
  });

  // If no safe directions, just continue in the current direction
  if (safeDirections.length === 0) {
    return currentDirection;
  }

  // Calculate how much space is available after moving in each direction
  // This helps avoid getting trapped in tight spaces
  const directionScores = safeDirections.map((dir) => {
    const pos = nextPositions[dir];

    // Base score starts with available free spaces
    let score = countAccessibleSpaces(pos, player.snake);

    // Bonus for moving toward fruit
    const closestFruit = findClosestFruit(head);
    if (closestFruit) {
      const currentDistance = manhattanDistance(head, closestFruit);
      const newDistance = manhattanDistance(pos, closestFruit);

      // If this move gets us closer to the fruit, add bonus
      if (newDistance < currentDistance) {
        score += 5;
      }
    }

    return { direction: dir, score };
  });

  // Sort by score (descending)
  directionScores.sort((a, b) => b.score - a.score);

  // Return the direction with the highest score
  return directionScores[0].direction;
};

// Find the closest fruit from a point
const findClosestFruit = (from: Point): Point | null => {
  let closestFruit: Point | null = null;
  let closestDistance = Infinity;

  for (const fruit of fruits) {
    const distance = manhattanDistance(from, fruit);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestFruit = fruit;
    }
  }

  return closestFruit;
};

// Count accessible spaces from a position using flood fill
// This helps the AI avoid trapping itself
const countAccessibleSpaces = (start: Point, snakeBody: Point[]): number => {
  // Create a set to track visited positions
  const visited = new Set<string>();

  // Add snake body segments to visited (can't go there)
  snakeBody.forEach((segment) => {
    visited.add(`${segment.x},${segment.y}`);
  });

  // Add the starting point
  const queue: Point[] = [start];
  visited.add(`${start.x},${start.y}`);

  // Count accessible spaces (limited to prevent excessive computation)
  let count = 0;
  const maxExplore = 100; // Limit exploration to avoid performance issues

  while (queue.length > 0 && count < maxExplore) {
    const current = queue.shift()!;
    count++;

    // Check all four adjacent positions
    const neighbors = [
      { x: current.x, y: current.y - 1 }, // up
      { x: current.x, y: current.y + 1 }, // down
      { x: current.x - 1, y: current.y }, // left
      { x: current.x + 1, y: current.y }, // right
    ];

    for (const neighbor of neighbors) {
      const key = `${neighbor.x},${neighbor.y}`;

      // Skip if already visited, out of bounds, or occupied by a snake
      if (
        visited.has(key) ||
        neighbor.x < 0 ||
        neighbor.x >= GRID_WIDTH ||
        neighbor.y < 0 ||
        neighbor.y >= GRID_HEIGHT
      ) {
        continue;
      }

      // For other players' snakes
      let isOccupied = false;
      for (const id in players) {
        if (
          players[id].snake.some(
            (segment) => segment.x === neighbor.x && segment.y === neighbor.y
          )
        ) {
          isOccupied = true;
          break;
        }
      }

      if (isOccupied) {
        continue;
      }

      visited.add(key);
      queue.push(neighbor);
    }
  }

  return count;
};

// Manage AI players based on human player count
const manageAIPlayers = () => {
  // Count human players
  const humanPlayers = Object.values(players).filter((player) => !player.isAI);
  const humanCount = humanPlayers.length;

  // Count current AI players
  const aiPlayers = Object.values(players).filter((player) => player.isAI);
  const aiCount = aiPlayers.length;

  // Determine target AI count
  let targetAICount = 0;
  if (humanCount === 1) targetAICount = 3;
  else if (humanCount === 2) targetAICount = 2;
  else if (humanCount === 3) targetAICount = 1;

  // Add or remove AI players to reach target
  if (aiCount < targetAICount) {
    // Need to add AI players
    for (let i = 0; i < targetAICount - aiCount; i++) {
      addAIPlayer();
    }
  } else if (aiCount > targetAICount) {
    // let current AI players just play out until they die
    // Need to remove AI players
    // const playersToRemove = aiPlayers.slice(0, aiCount - targetAICount);
    // for (const player of playersToRemove) {
    //   delete players[player.id];
    // }
  }
};

// Create a new AI player
const addAIPlayer = () => {
  const aiId = `ai-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const spawnPos = getSafeSpawnPosition();
  const aiPlayer: Player = {
    id: aiId,
    snake: createSnake(spawnPos, "RIGHT"),
    direction: "RIGHT",
    score: 0,
    color: generatePlayerColor(),
    directionQueue: [],
    isAI: true,
  };

  players[aiId] = aiPlayer;
};

// Start or stop the game loop based on player count
const manageGameLoop = () => {
  const playerCount = Object.keys(players).length;

  if (playerCount > 0 && !gameLoopInterval) {
    // Start the game loop if we have players but no active interval
    gameLoopInterval = setInterval(gameLoop, TICK_RATE);
    console.log("Game loop started");
  } else if (playerCount === 0 && gameLoopInterval) {
    // Stop the game loop if no players remain
    clearInterval(gameLoopInterval);
    gameLoopInterval = null;
    console.log("Game loop stopped - no players");
  }
};

// Game loop function
const gameLoop = () => {
  // First update AI player directions
  for (const id in players) {
    if (players[id].isAI) {
      const aiDirection = calculateAIMove(id);
      players[id].directionQueue = [aiDirection];
    }
  }

  // Save the current snake positions for collision detection.
  const currentSnakes: Record<string, Point[]> = {};
  for (const id in players) {
    currentSnakes[id] = players[id].snake;
  }

  // Process each player.
  for (const id in players) {
    const player = players[id];
    const head = player.snake[0];
    let newHead: Point;
    if (player.directionQueue.length > 0) {
      player.direction = player.directionQueue.shift()!;
    }
    switch (player.direction) {
      case "UP":
        newHead = { x: head.x, y: head.y - 1 };
        break;
      case "DOWN":
        newHead = { x: head.x, y: head.y + 1 };
        break;
      case "LEFT":
        newHead = { x: head.x - 1, y: head.y };
        break;
      case "RIGHT":
      default:
        newHead = { x: head.x + 1, y: head.y };
        break;
    }

    // Check for collisions: with the walls or any snake segment.
    let collision = false;
    if (
      newHead.x < 0 ||
      newHead.x >= GRID_WIDTH ||
      newHead.y < 0 ||
      newHead.y >= GRID_HEIGHT
    ) {
      collision = true;
    } else {
      for (const otherId in currentSnakes) {
        const segments = currentSnakes[otherId];
        if (segments.some((segment) => pointsEqual(segment, newHead))) {
          collision = true;
          break;
        }
      }
    }

    if (collision) {
      // Before respawning, turn ~25% of the snake's body segments into fruits.
      for (const segment of player.snake) {
        if (Math.random() < 0.25) {
          if (!fruits.some((fruit) => pointsEqual(fruit, segment))) {
            fruits.push({ ...segment });
          }
        }
      }
      // Respawn the player at a safe position with a small snake.
      const spawnPos = getSafeSpawnPosition();
      player.direction = "RIGHT";
      player.snake = createSnake(spawnPos, player.direction);
      player.score = 0;
      continue;
    }

    // Check if the snake has eaten a fruit.
    const fruitIndex = fruits.findIndex((fruit) => pointsEqual(fruit, newHead));
    let grow = false;
    if (fruitIndex !== -1) {
      fruits.splice(fruitIndex, 1);
      player.score += 1;
      grow = true;
      // Spawn a new fruit to keep the board populated.
      spawnFruit();
    }

    // Move the snake: add the new head.
    const newSnake = [newHead, ...player.snake];
    if (!grow) {
      newSnake.pop();
    }
    player.snake = newSnake;
  }

  // Broadcast the updated game state.
  io.emit("gameState", {
    players,
    fruits,
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
  });
};

// --- Socket.IO Handling ---
io.on("connection", (socket) => {
  console.log("New connection:", socket.id);
  const spawnPos = getSafeSpawnPosition();
  const newPlayer: Player = {
    id: socket.id,
    snake: createSnake(spawnPos, "RIGHT"),
    direction: "RIGHT",
    score: 0,
    color: generatePlayerColor(),
    directionQueue: [],
  };
  players[socket.id] = newPlayer;

  // Update AI players and manage game loop after player joins
  manageAIPlayers();
  manageGameLoop();

  // Listen for direction changes from the client.
  socket.on("changeDirection", (newDirection: Direction) => {
    if (!players[socket.id]) return;

    let precedingDirection = players[socket.id].direction;
    if (players[socket.id].directionQueue.length > 0)
      precedingDirection =
        players[socket.id].directionQueue[
          players[socket.id].directionQueue.length - 1
        ];

    // just make sure the next direction doesn't conflict with the previous direction
    if (!isOpposite(precedingDirection, newDirection)) {
      players[socket.id].directionQueue.push(newDirection);
    }
  });

  socket.on("disconnect", () => {
    console.log("Disconnect:", socket.id);
    delete players[socket.id];

    // Update AI players and manage game loop after player leaves
    manageAIPlayers();
    manageGameLoop();
  });
});

app.use(cors());

// Optionally serve static files.
app.use(express.static("public"));

// server client built files
app.use(express.static("dist"));

const PORT = process.env.SERVER_PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
