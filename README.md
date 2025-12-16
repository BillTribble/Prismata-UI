# Prismata: The AI Crystal Library

**Prismata** is an open-source visualization tool that transforms the internal weights and activations of Artificial Intelligence models into 3D Crystalline Structures.

Using Global PCA and topological mapping, Prismata reveals the physical shape of "Thought" inside architectures like Transformers and CNNs.

## The Gallery

### 1. The Twisting Helix (GPT-2)
*   **Type**: Decoder (Generative)
*   **Shape**: A tornado-like tower that twists as it predicts the future.
*   **Chemistry**: Chaos -> Order.

### 2. The Stability Pillar (BERT)
*   **Type**: Encoder (Analytical)
*   **Shape**: A rigid, symmetrical column.
*   **Chemistry**: Parallel Processing.

### 3. The Inverted Pyramid (ResNet)
*   **Type**: CNN (Vision)
*   **Shape**: An expanding cone that grows from simple pixels to complex concepts.
*   **Chemistry**: Feature Explosion.

## Usage

### 1. View Crystals
Open `index.html` (via `npx vite`) to enter the 3D Prismata Viewer.

### 2. Generate Your Own
Use the `scripts/prismata_make.py` tool to generate a crystal from any HuggingFace model.

```bash
# Generate Structure
python scripts/prismata_make.py gpt2 --mode layers

# Generate "Thought" (Activation Crystal)
python scripts/prismata_make.py gpt2 --mode activation --text "Your thought here"

# Generate "Vision" (CNN Activation)
python scripts/prismata_make.py microsoft/resnet-50 --mode activation --image "image.jpg"
```

## Contributing
Submit your own AI Crystals!
1.  Generate a `.ply` file.
2.  Create a folder in `public/crystals/`.
3.  Add it to `manifest.json`.
4.  Open a Pull Request.

---
*Created by Prismata Core*
