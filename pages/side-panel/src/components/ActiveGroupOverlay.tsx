interface ActiveGroupOverlayProps {
  onGoBack: () => void;
}

export function ActiveGroupOverlay({ onGoBack }: ActiveGroupOverlayProps) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white p-6 text-center">
      <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 128 128" fill="none" className="mb-4">
        <path
          transform="translate(6.4, 6.4) scale(0.9)"
          d="M 67 21.992 C 57.152 22.798, 48.204 25.170, 42.466 28.494 C 32.748 34.124, 24.401 46.777, 21.995 59.525 C 20.796 65.881, 21.306 74.453, 22.943 75.465 C 23.399 75.746, 32.260 71.642, 42.635 66.344 C 53.011 61.046, 61.026 57.228, 60.447 57.859 C 59.868 58.490, 51.543 65.006, 41.947 72.339 L 24.500 85.671 24.216 96.392 L 23.931 107.112 28.716 106.806 L 33.500 106.500 33.796 101.430 L 34.092 96.360 40.796 97.771 C 48.936 99.485, 63.530 98.888, 70 96.576 C 75.802 94.502, 84.908 87.656, 89.429 81.968 C 91.382 79.511, 92.985 77.162, 92.990 76.750 C 92.996 76.338, 89.737 75.961, 85.750 75.914 C 80.791 75.855, 79.290 75.587, 81 75.065 C 88.986 72.627, 97.723 66.263, 100.585 60.800 C 102.927 56.329, 102.499 56, 94.345 56 L 86.690 56 92.712 52.108 C 102.253 45.941, 107 38.316, 107 29.157 C 107 23.456, 106.992 23.452, 92.736 22.487 C 88.206 22.181, 82.475 21.787, 80 21.613 C 77.525 21.439, 71.675 21.609, 67 21.992"
          fill="black"
          fillRule="evenodd"
        />
      </svg>
      <h2 className="mb-2 text-lg font-semibold text-gray-900">Autumn is active in this tab group</h2>
      <p className="mb-6 text-sm text-gray-500">Autumn can browse across sites and handle multi-tab tasks.</p>
      <button
        type="button"
        onClick={onGoBack}
        className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black/90">
        Open chat
      </button>
    </div>
  );
}
