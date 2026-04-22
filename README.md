# Mincraft - High-Performance Voxel Engine

A powerful voxel engine built with **TypeScript** and **WebGPU**, focusing on performance and modern rendering techniques.

## 🚀 Features

- **WebGPU Powered**: Leverages modern GPU features for high-performance rendering.
- **Multithreaded Architecture**: Chunk generation and meshing are offloaded to WebWorkers.
- **Advanced Rendering**:
  - Deferred Rendering Pipeline.
  - SSAO (Screen Space Ambient Occlusion).
  - G-Buffer implementation.
  - Greedy Meshing for optimized geometry.
- **ECS (Entity Component System)**: Flexible architecture for game logic and physics.
- **Dynamic World**: Noise-based terrain generation with real-time updates.

## 🛠️ Tech Stack

- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Graphics API**: [WebGPU](https://gpuweb.github.io/gpuweb/)
- **Math**: Custom vector and matrix libraries.

## 📦 Getting Started

### Prerequisites

- A browser with WebGPU support (e.g., Chrome, Edge).
- [Node.js](https://nodejs.org/) installed.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/zakrievahmed129-lgtm/mincraft.git
   cd mincraft
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## 🏗️ Architecture

- `src/core`: Core engine logic, GPU context, and input handling.
- `src/renderer`: WebGPU pipelines, shaders (WGSL), and geometry management.
- `src/world`: Chunk management, terrain generation, and worker orchestration.
- `src/ecs`: Entity Component System for world entities.
- `src/systems`: Game systems (Physics, Camera, Rendering, etc.).

## 📜 License

MIT
