import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Layout } from '../../components/Layout';
import type { TrainingOut, EmployeeListItem, ContentBlock } from '../../types';

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function fetchTraining(id: string): Promise<TrainingOut> {
  const { data } = await apiClient.get(`/admin/trainings/${id}`);
  return data;
}

async function fetchEmployees(): Promise<EmployeeListItem[]> {
  const { data } = await apiClient.get('/admin/users');
  return data;
}

async function assignTraining(trainingId: string, userIds: number[]) {
  await apiClient.post(`/admin/trainings/${trainingId}/assign`, { user_ids: userIds });
}

// ---------------------------------------------------------------------------
// Content renderer
// ---------------------------------------------------------------------------

function ContentRenderer({ block }: { block: ContentBlock }) {
  if (block.type === 'paragraph') {
    return <p className="text-gray-700 text-sm leading-relaxed">{block.text}</p>;
  }
  if (block.type === 'bullet_list') {
    return (
      <ul className="list-disc list-inside text-gray-700 text-sm space-y-1">
        {block.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminTrainingDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
  const [assignSuccess, setAssignSuccess] = useState(false);

  const { data: training, isLoading: loadingTraining } = useQuery({
    queryKey: ['admin', 'training', id],
    queryFn: () => fetchTraining(id!),
    enabled: !!id,
  });

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ['admin', 'employees'],
    queryFn: fetchEmployees,
  });

  const assignMutation = useMutation({
    mutationFn: () => assignTraining(id!, selectedEmployees),
    onSuccess: () => {
      setAssignSuccess(true);
      setSelectedEmployees([]);
      qc.invalidateQueries({ queryKey: ['admin', 'training', id] });
      setTimeout(() => setAssignSuccess(false), 3000);
    },
  });

  const assignedIds = new Set(training?.assigned_user_ids ?? []);

  function toggleEmployee(empId: number) {
    setSelectedEmployees((prev) =>
      prev.includes(empId) ? prev.filter((x) => x !== empId) : [...prev, empId]
    );
  }

  if (loadingTraining) {
    return (
      <Layout>
        <p className="text-gray-500 text-sm">Loading training…</p>
      </Layout>
    );
  }

  if (!training) {
    return (
      <Layout>
        <p className="text-red-600 text-sm">Training not found.</p>
      </Layout>
    );
  }

  const modules = training.modules?.modules ?? [];

  return (
    <Layout>
      <h2 className="text-xl font-bold text-gray-900 mb-6">{training.title}</h2>

      {/* Modules */}
      <div className="space-y-6 mb-10">
        {modules.map((mod) => (
          <div key={mod.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
              <h3 className="font-semibold text-gray-900">{mod.title}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{mod.summary}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {mod.content.map((block, i) => (
                <ContentRenderer key={i} block={block} />
              ))}
            </div>

            {/* Quiz questions (read-only) */}
            <div className="px-5 py-4 border-t border-gray-100 bg-indigo-50">
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-3">
                Quiz Questions
              </p>
              <div className="space-y-4">
                {mod.quiz.questions.map((q) => (
                  <div key={q.id}>
                    <p className="text-sm font-medium text-gray-800">{q.question}</p>
                    <ul className="mt-1.5 space-y-1">
                      {q.options.map((opt, i) => (
                        <li
                          key={i}
                          className={`text-sm px-3 py-1.5 rounded-lg ${
                            i === q.correct_index
                              ? 'bg-green-100 text-green-800 font-medium'
                              : 'text-gray-600'
                          }`}
                        >
                          {opt}
                          {i === q.correct_index && (
                            <span className="ml-2 text-xs">(correct)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-gray-500 mt-1 italic">{q.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Assignment panel */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Assign to Employees</h3>
        <p className="text-xs text-gray-400 mb-4">
          {assignedIds.size > 0
            ? `${assignedIds.size} employee${assignedIds.size !== 1 ? 's' : ''} already assigned`
            : 'No employees assigned yet'}
        </p>

        {loadingEmployees && <p className="text-sm text-gray-400">Loading employees…</p>}

        {!loadingEmployees && employees.length === 0 && (
          <p className="text-sm text-gray-400">No employees found. Register employees first.</p>
        )}

        <div className="space-y-2 mb-4">
          {employees.map((emp) => {
            const alreadyAssigned = assignedIds.has(emp.id);
            return (
              <div key={emp.id} className="flex items-center gap-3">
                {alreadyAssigned ? (
                  <>
                    <span className="w-4 h-4 flex items-center justify-center text-green-600">✓</span>
                    <span className="text-sm text-gray-500">{emp.email}</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Assigned</span>
                  </>
                ) : (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedEmployees.includes(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span className="text-sm text-gray-700">{emp.email}</span>
                  </label>
                )}
              </div>
            );
          })}
        </div>

        {assignSuccess && (
          <p className="text-sm text-green-600 font-medium mb-2">
            Training assigned successfully!
          </p>
        )}

        <button
          onClick={() => assignMutation.mutate()}
          disabled={selectedEmployees.length === 0 || assignMutation.isPending}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition"
        >
          {assignMutation.isPending ? 'Assigning…' : 'Assign to selected'}
        </button>
      </div>
    </Layout>
  );
}
