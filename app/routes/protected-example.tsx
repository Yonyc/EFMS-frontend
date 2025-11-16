import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';

export function meta() {
  return [
    { title: "Protected Page - EMFS" },
    { name: "description", content: "This is a protected page" },
  ];
}

export default function ProtectedExample() {
  const { user } = useAuth();

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-4">Protected Page</h1>
        <p className="mb-4">
          This page is only accessible to authenticated users.
        </p>
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-xl font-semibold mb-2">User Information:</h2>
          <p><strong>ID:</strong> {user?.id}</p>
          <p><strong>Username:</strong> {user?.username}</p>
          {user?.email && <p><strong>Email:</strong> {user?.email}</p>}
        </div>
      </div>
    </ProtectedRoute>
  );
}
