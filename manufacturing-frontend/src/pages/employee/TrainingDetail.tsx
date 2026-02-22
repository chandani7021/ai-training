import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Layout } from '../../components/Layout';
import type {
  EmployeeTrainingDetail,
  ContentBlock,
  Module,
  QuizQuestion,
  QuizAnswer,
  QuizResult,
} from '../../types';

// ---------------------------------------------------------------------------
// Stage type — drives the whole page state machine
// ---------------------------------------------------------------------------

type Stage =
  | { type: 'module-content'; index: number }
  | { type: 'module-quiz'; index: number }
  | { type: 'final-quiz' }
  | { type: 'result' };

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function fetchTraining(id: string): Promise<EmployeeTrainingDetail> {
  const { data } = await apiClient.get(`/employee/trainings/${id}`);
  return data;
}

async function submitQuiz(id: string, answers: QuizAnswer[]): Promise<QuizResult> {
  const { data } = await apiClient.post(`/employee/trainings/${id}/submit-quiz`, { answers });
  return data;
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
// Reusable quiz question renderer
// ---------------------------------------------------------------------------

function QuizSection({
  questions,
  answers,
  onSelect,
  checked,
}: {
  questions: QuizQuestion[];
  answers: Record<string, number>;
  onSelect: (qid: string, idx: number) => void;
  checked: boolean;
}) {
  return (
    <div className="space-y-6">
      {questions.map((q, qi) => {
        const selected = answers[q.id];
        return (
          <div key={q.id}>
            <p className="text-sm font-semibold text-gray-800 mb-2">
              {qi + 1}. {q.question}
            </p>
            <div className="space-y-2">
              {q.options.map((opt, i) => {
                let style =
                  'border border-gray-200 text-gray-700 hover:border-blue-400 hover:bg-blue-50';
                if (!checked && selected === i) {
                  style = 'border border-blue-500 bg-blue-50 text-blue-800';
                }
                if (checked) {
                  if (i === q.correct_index) {
                    style = 'border border-green-400 bg-green-50 text-green-800 font-medium';
                  } else if (selected === i) {
                    style = 'border border-red-400 bg-red-50 text-red-700 line-through';
                  } else {
                    style = 'border border-gray-100 text-gray-400';
                  }
                }
                return (
                  <button
                    key={i}
                    onClick={() => onSelect(q.id, i)}
                    disabled={checked}
                    className={`w-full text-left px-4 py-3 rounded-lg text-sm transition ${style} disabled:cursor-default`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {checked && q.explanation && (
              <p className="mt-1.5 text-xs text-gray-500 italic">{q.explanation}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step progress bar
// ---------------------------------------------------------------------------

function StepIndicator({
  modules,
  stage,
}: {
  modules: Module[];
  stage: Stage;
}) {
  function stepState(i: number): 'done' | 'active' | 'pending' {
    if (stage.type === 'result') return 'done';
    if (stage.type === 'final-quiz') {
      return i < modules.length ? 'done' : 'active';
    }
    if (stage.type === 'module-content' || stage.type === 'module-quiz') {
      if (i < stage.index) return 'done';
      if (i === stage.index) return 'active';
    }
    return 'pending';
  }

  const finalState: 'done' | 'active' | 'pending' =
    stage.type === 'result'
      ? 'done'
      : stage.type === 'final-quiz'
      ? 'active'
      : 'pending';

  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      {modules.map((mod, i) => (
        <div key={mod.id} className="flex items-center gap-2">
          <div
            title={mod.title}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${
              stepState(i) === 'done'
                ? 'bg-green-500 text-white'
                : stepState(i) === 'active'
                ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            {stepState(i) === 'done' ? '✓' : i + 1}
          </div>
          <div
            className={`h-1 w-8 rounded-full transition ${
              stepState(i) === 'done' ? 'bg-green-400' : 'bg-gray-200'
            }`}
          />
        </div>
      ))}
      <span
        className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
          finalState === 'active'
            ? 'bg-indigo-600 text-white border-indigo-600'
            : finalState === 'done'
            ? 'bg-green-500 text-white border-green-500'
            : 'bg-gray-100 text-gray-400 border-gray-200'
        }`}
      >
        Final Quiz
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EmployeeTrainingDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const [stage, setStage] = useState<Stage>({ type: 'module-content', index: 0 });
  // Per-module practice answers: { moduleIndex → { questionId → selectedIndex } }
  const [moduleAnswers, setModuleAnswers] = useState<Record<number, Record<string, number>>>({});
  const [moduleChecked, setModuleChecked] = useState<Record<number, boolean>>({});
  // Final quiz answers
  const [finalAnswers, setFinalAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);

  const { data: training, isLoading } = useQuery({
    queryKey: ['employee', 'training', id],
    queryFn: () => fetchTraining(id!),
    enabled: !!id,
  });

  const submitMutation = useMutation({
    mutationFn: (payload: QuizAnswer[]) => submitQuiz(id!, payload),
    onSuccess: (data) => {
      setResult(data);
      setStage({ type: 'result' });
      qc.invalidateQueries({ queryKey: ['employee', 'trainings'] });
      qc.invalidateQueries({ queryKey: ['employee', 'training', id] });
    },
  });

  function handleRetake() {
    setStage({ type: 'module-content', index: 0 });
    setModuleAnswers({});
    setModuleChecked({});
    setFinalAnswers({});
    setResult(null);
  }

  if (isLoading) {
    return (
      <Layout>
        <p className="text-gray-500 text-sm">Loading training…</p>
      </Layout>
    );
  }

  if (!training) {
    return (
      <Layout>
        <p className="text-red-600 text-sm">Training not found or not assigned to you.</p>
      </Layout>
    );
  }

  const modules = training.modules?.modules ?? [];
  const allQuestions = modules.flatMap((m) => m.quiz.questions);

  // ------------------------------------------------------------------
  // Module content screen
  // ------------------------------------------------------------------
  if (stage.type === 'module-content') {
    const mod = modules[stage.index];
    return (
      <Layout>
        <h2 className="text-xl font-bold text-gray-900 mb-5">{training.title}</h2>
        <StepIndicator modules={modules} stage={stage} />

        {training.progress.completed && (
          <div className="mb-4 inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-1.5 rounded-lg">
            <span>✓</span>
            <span>Previously completed — Score: {training.progress.score}%</span>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-0.5">
              Module {stage.index + 1} of {modules.length}
            </p>
            <h3 className="font-semibold text-gray-900">{mod.title}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{mod.summary}</p>
          </div>
          <div className="px-5 py-5 space-y-4">
            {mod.content.map((block, i) => (
              <ContentRenderer key={i} block={block} />
            ))}
          </div>
        </div>

        <button
          onClick={() => setStage({ type: 'module-quiz', index: stage.index })}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg text-sm transition"
        >
          Next: Take Module {stage.index + 1} Quiz →
        </button>

        {training.progress.completed && (
          <div className="mt-4 text-center">
            <button
              onClick={handleRetake}
              className="text-sm text-gray-400 hover:text-gray-600 underline"
            >
              Restart from beginning
            </button>
          </div>
        )}
      </Layout>
    );
  }

  // ------------------------------------------------------------------
  // Module quiz screen (practice — answers shown locally, not submitted)
  // ------------------------------------------------------------------
  if (stage.type === 'module-quiz') {
    const mod = modules[stage.index];
    const isLastModule = stage.index === modules.length - 1;
    const currentAnswers = moduleAnswers[stage.index] ?? {};
    const isChecked = moduleChecked[stage.index] ?? false;
    const allAnswered = mod.quiz.questions.every((q) => currentAnswers[q.id] !== undefined);

    return (
      <Layout>
        <h2 className="text-xl font-bold text-gray-900 mb-5">{training.title}</h2>
        <StepIndicator modules={modules} stage={stage} />

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-5 bg-indigo-500 rounded-full" />
            <h4 className="font-bold text-gray-900">
              Module {stage.index + 1} Quiz
              <span className="ml-2 text-sm font-normal text-gray-400">— {mod.title}</span>
            </h4>
          </div>
          <p className="text-xs text-gray-400 mb-6">
            {mod.quiz.questions.length} question{mod.quiz.questions.length !== 1 ? 's' : ''}
            {' '}· Practice round — answers shown immediately
          </p>

          <QuizSection
            questions={mod.quiz.questions}
            answers={currentAnswers}
            onSelect={(qid, idx) => {
              if (!isChecked) {
                setModuleAnswers((prev) => ({
                  ...prev,
                  [stage.index]: { ...(prev[stage.index] ?? {}), [qid]: idx },
                }));
              }
            }}
            checked={isChecked}
          />

          {!isChecked && (
            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {Object.keys(currentAnswers).length} / {mod.quiz.questions.length} answered
              </p>
              <button
                onClick={() =>
                  setModuleChecked((prev) => ({ ...prev, [stage.index]: true }))
                }
                disabled={!allAnswered}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition"
              >
                Check Answers
              </button>
            </div>
          )}
        </div>

        {isChecked && (
          <div className="flex gap-3 mt-2">
            <button
              onClick={() => {
                setModuleAnswers((prev) => ({ ...prev, [stage.index]: {} }));
                setModuleChecked((prev) => ({ ...prev, [stage.index]: false }));
              }}
              className="flex-1 border border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-800 font-medium py-3 rounded-lg text-sm transition"
            >
              Retake This Quiz
            </button>
            <button
              onClick={() => {
                if (isLastModule) {
                  setStage({ type: 'final-quiz' });
                } else {
                  setStage({ type: 'module-content', index: stage.index + 1 });
                }
              }}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg text-sm transition"
            >
              {isLastModule ? 'Next: Final Quiz →' : `Next: Module ${stage.index + 2} →`}
            </button>
          </div>
        )}
      </Layout>
    );
  }

  // ------------------------------------------------------------------
  // Final quiz screen (all questions — submitted to backend)
  // ------------------------------------------------------------------
  if (stage.type === 'final-quiz') {
    const allAnswered = allQuestions.every((q) => finalAnswers[q.id] !== undefined);

    function handleFinalSubmit() {
      const payload: QuizAnswer[] = Object.entries(finalAnswers).map(([qid, idx]) => ({
        question_id: qid,
        selected_index: idx,
      }));
      submitMutation.mutate(payload);
    }

    return (
      <Layout>
        <h2 className="text-xl font-bold text-gray-900 mb-5">{training.title}</h2>
        <StepIndicator modules={modules} stage={stage} />

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-5 bg-indigo-600 rounded-full" />
            <h4 className="font-bold text-gray-900 text-lg">Final Quiz</h4>
          </div>
          <p className="text-xs text-gray-400 mb-6">
            {allQuestions.length} questions across all {modules.length} modules · This is scored
          </p>

          <QuizSection
            questions={allQuestions}
            answers={finalAnswers}
            onSelect={(qid, idx) =>
              setFinalAnswers((prev) => ({ ...prev, [qid]: idx }))
            }
            checked={false}
          />

          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {Object.keys(finalAnswers).length} / {allQuestions.length} answered
            </p>
            <button
              onClick={handleFinalSubmit}
              disabled={!allAnswered || submitMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold px-8 py-2.5 rounded-lg text-sm transition"
            >
              {submitMutation.isPending ? 'Submitting…' : 'Submit & See Results'}
            </button>
          </div>

          {submitMutation.isError && (
            <p className="mt-3 text-sm text-red-600">Failed to submit. Please try again.</p>
          )}
        </div>
      </Layout>
    );
  }

  // ------------------------------------------------------------------
  // Result screen
  // ------------------------------------------------------------------
  if (stage.type === 'result' && result) {
    return (
      <Layout>
        <h2 className="text-xl font-bold text-gray-900 mb-6">{training.title}</h2>
        <div
          className={`p-10 rounded-2xl text-center ${
            result.passed
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          <p
            className={`text-6xl font-bold mb-3 ${
              result.passed ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {result.score}%
          </p>
          <p
            className={`text-lg font-semibold ${
              result.passed ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {result.passed ? 'Passed! Well done.' : 'Not passed. Score ≥ 80% required.'}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            {result.passed
              ? 'You have successfully completed this training.'
              : 'Review the modules and try again to improve your score.'}
          </p>
          <button
            onClick={handleRetake}
            className="mt-8 bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-lg text-sm font-medium transition"
          >
            Retake Training
          </button>
        </div>
      </Layout>
    );
  }

  return null;
}
