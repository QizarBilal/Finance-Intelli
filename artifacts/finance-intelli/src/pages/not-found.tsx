export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-8xl font-display font-bold text-primary opacity-20 mb-4">404</h1>
      <h2 className="text-2xl font-semibold mb-2">Page not found</h2>
      <p className="text-muted-foreground max-w-md">
        The page you are looking for doesn't exist or has been moved.
      </p>
    </div>
  );
}
