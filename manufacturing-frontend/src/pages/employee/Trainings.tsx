import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Layout } from '../../components/Layout';
import type { EmployeeTrainingItem } from '../../types';

async function fetchMyTrainings(): Promise<EmployeeTrainingItem[]> {
  const { data } = await apiClient.get('/employee/trainings');
  return data;
}

function StatusChip({ completed, score }: { completed: boolean; score: number | null }) {
  if (completed) {
    return (
      <span className="inline-block bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
        Passed &mdash; {score}%
      </span>
    );
  }
  if (score !== null) {
    return (
      <span className="inline-block bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
        Failed &mdash; {score}%
      </span>
    );
  }
  return (
    <span className="inline-block bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-0.5 rounded-full">
      Not started
    </span>
  );
}

export default function EmployeeTrainings() {
  const { data: trainings = [], isLoading } = useQuery({
    queryKey: ['employee', 'trainings'],
    queryFn: fetchMyTrainings,
  });

  return (
    <Layout>
      <h2 className="text-xl font-bold text-gray-900 mb-6">My Trainings</h2>

      {isLoading && <p className="text-gray-500 text-sm">Loading your trainings…</p>}

      {!isLoading && trainings.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No trainings assigned yet.</p>
          <p className="text-sm mt-1">Check back with your administrator.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {trainings.map((t) => (
          <Link
            key={t.training_id}
            to={`/employee/trainings/${t.training_id}`}
            className="block bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:border-blue-400 hover:shadow-md transition"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="font-semibold text-gray-900 leading-snug">{t.title}</h3>
              <StatusChip completed={t.completed} score={t.score} />
            </div>
            <p className="text-xs text-gray-400">
              Assigned {new Date(t.assigned_at).toLocaleDateString()}
            </p>
            <p className="mt-3 text-sm text-blue-600 font-medium">
              {t.completed ? 'Review training →' : 'Start training →'}
            </p>
          </Link>
        ))}
      </div>
    </Layout>
  );
}
