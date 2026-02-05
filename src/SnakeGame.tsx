import React, { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };

enum Direction {
  UP = "UP",
  DOWN = "DOWN",
  LEFT = "LEFT",
  RIGHT = "RIGHT",
}

const GRID_SIZE = 20; // number of cells per row/column
const CELL_SIZE = 20; // size (in pixels) of each cell
const INITIAL_SNAKE: Point[] = [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
  { x: 8, y: 10 },
];

// Returns a random position on the grid not occupied by the snake.
const getRandomFruitPosition = (snake: Point[]): Point => {
  let newFruit: Point;
  while (true) {
    newFruit = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
    if (
      !snake.some(
        (segment) => segment.x === newFruit.x && segment.y === newFruit.y,
      )
    ) {
      return newFruit;
    }
  }
};

// Returns true if dir2 is directly opposite of dir1.
const isOpposite = (dir1: Direction, dir2: Direction): boolean => {
  return (
    (dir1 === Direction.UP && dir2 === Direction.DOWN) ||
    (dir1 === Direction.DOWN && dir2 === Direction.UP) ||
    (dir1 === Direction.LEFT && dir2 === Direction.RIGHT) ||
    (dir1 === Direction.RIGHT && dir2 === Direction.LEFT)
  );
};

interface SnakeGameProps {
  mode: "USER" | "AI";
}

const SnakeGame: React.FC<SnakeGameProps> = ({ mode }) => {
  const [snake, setSnake] = useState<Point[]>(INITIAL_SNAKE);
  const [fruit, setFruit] = useState<Point>(
    getRandomFruitPosition(INITIAL_SNAKE),
  );
  const [direction, setDirection] = useState<Direction>(Direction.RIGHT);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);

  // We use refs so our game loop callback always reads the latest state.
  const snakeRef = useRef(snake);
  const directionRef = useRef(direction);
  const fruitRef = useRef(fruit);

  useEffect(() => {
    snakeRef.current = snake;
  }, [snake]);
  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);
  useEffect(() => {
    fruitRef.current = fruit;
  }, [fruit]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // For USER mode, listen for arrow key presses.
  useEffect(() => {
    if (mode === "USER") {
      const handleKeyDown = (e: KeyboardEvent) => {
        let newDirection: Direction | null = null;
        if (e.key === "ArrowUp") newDirection = Direction.UP;
        else if (e.key === "ArrowDown") newDirection = Direction.DOWN;
        else if (e.key === "ArrowLeft") newDirection = Direction.LEFT;
        else if (e.key === "ArrowRight") newDirection = Direction.RIGHT;
        if (newDirection && !isOpposite(directionRef.current, newDirection)) {
          setDirection(newDirection);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [mode]);

  // The game loop: update the snake’s position, check for collisions, etc.
  const updateGame = () => {
    let currentSnake = snakeRef.current;
    let currentDirection = directionRef.current;
    let currentFruit = fruitRef.current;

    // In AI mode, pick a direction that moves the snake toward the fruit.
    if (mode === "AI") {
      const head = currentSnake[0];
      let desiredDirection = currentDirection;
      if (head.x < currentFruit.x && currentDirection !== Direction.LEFT) {
        desiredDirection = Direction.RIGHT;
      } else if (
        head.x > currentFruit.x &&
        currentDirection !== Direction.RIGHT
      ) {
        desiredDirection = Direction.LEFT;
      } else if (head.y < currentFruit.y && currentDirection !== Direction.UP) {
        desiredDirection = Direction.DOWN;
      } else if (
        head.y > currentFruit.y &&
        currentDirection !== Direction.DOWN
      ) {
        desiredDirection = Direction.UP;
      }
      if (!isOpposite(currentDirection, desiredDirection)) {
        currentDirection = desiredDirection;
        setDirection(desiredDirection);
      }
    }

    const head = currentSnake[0];
    let newHead: Point;
    switch (currentDirection) {
      case Direction.UP:
        newHead = { x: head.x, y: head.y - 1 };
        break;
      case Direction.DOWN:
        newHead = { x: head.x, y: head.y + 1 };
        break;
      case Direction.LEFT:
        newHead = { x: head.x - 1, y: head.y };
        break;
      case Direction.RIGHT:
        newHead = { x: head.x + 1, y: head.y };
        break;
      default:
        newHead = { ...head };
    }

    // Check for collisions with walls.
    if (
      newHead.x < 0 ||
      newHead.x >= GRID_SIZE ||
      newHead.y < 0 ||
      newHead.y >= GRID_SIZE
    ) {
      setGameOver(true);
      return;
    }
    // Check for collisions with the snake’s body.
    if (
      currentSnake.some(
        (segment) => segment.x === newHead.x && segment.y === newHead.y,
      )
    ) {
      setGameOver(true);
      return;
    }

    let newSnake: Point[];
    // If the snake eats the fruit...
    if (newHead.x === currentFruit.x && newHead.y === currentFruit.y) {
      newSnake = [newHead, ...currentSnake];
      setScore((prev) => prev + 1);
      setFruit(getRandomFruitPosition(newSnake));
    } else {
      // Move the snake by adding the new head and removing the tail.
      newSnake = [newHead, ...currentSnake.slice(0, -1)];
    }
    setSnake(newSnake);
  };

  // Run the game loop with a fixed interval.
  useEffect(() => {
    if (gameOver) {
      // In AI mode, restart automatically after a short delay.
      if (mode === "AI") {
        setTimeout(restartGame, 1000);
      }
      return;
    }
    const interval = setInterval(() => {
      updateGame();
    }, 150);
    return () => clearInterval(interval);
  }, [gameOver, mode]);

  // Draw the game onto the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Clear the canvas.
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, GRID_SIZE * CELL_SIZE, GRID_SIZE * CELL_SIZE);
        // Draw the fruit.
        ctx.fillStyle = "red";
        ctx.fillRect(
          fruit.x * CELL_SIZE,
          fruit.y * CELL_SIZE,
          CELL_SIZE,
          CELL_SIZE,
        );
        // Draw the snake.
        ctx.fillStyle = "lime";
        snake.forEach((segment) => {
          ctx.fillRect(
            segment.x * CELL_SIZE,
            segment.y * CELL_SIZE,
            CELL_SIZE,
            CELL_SIZE,
          );
        });
      }
    }
  }, [snake, fruit]);

  // Reset the game state.
  const restartGame = () => {
    setSnake(INITIAL_SNAKE);
    setFruit(getRandomFruitPosition(INITIAL_SNAKE));
    setDirection(Direction.RIGHT);
    setGameOver(false);
    setScore(0);
  };

  // In user mode, show a Game Over screen with score and a restart button.
  if (gameOver && mode === "USER") {
    return (
      <div style={{ textAlign: "center", marginTop: "50px", color: "white" }}>
        <h1>Game Over</h1>
        <p>Your Score: {score}</p>
        <button onClick={restartGame} style={{ padding: "10px 20px" }}>
          Restart
        </button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", marginTop: "20px" }}>
      <canvas
        ref={canvasRef}
        width={GRID_SIZE * CELL_SIZE}
        height={GRID_SIZE * CELL_SIZE}
        style={{ border: "1px solid white", background: "blue" }}
      />
      <div style={{ color: "white", marginTop: "10px" }}>Score: {score}</div>
    </div>
  );
};

export default SnakeGame;
