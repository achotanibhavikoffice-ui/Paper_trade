import { useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { sampleLessons } from './LearnPage';

export function LessonDetailsPage() {
  const { lessonId = 'order-types' } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const lesson = sampleLessons.find((l) => l.id === lessonId) ?? sampleLessons[0];

  function handleAnswer(index: number) {
    setSelectedOption(index);
    setQuizSubmitted(true);
  }

  return (
    <>
      <PageHeader
        title={lesson.title}
        eyebrow={`LESSON • ${lesson.category}`}
        description={`${lesson.read_time} • ${lesson.difficulty} level`}
        breadcrumbs={[{ label: 'Learn', href: '/learn' }, { label: lesson.title }]}
        actions={
          <button onClick={() => navigate('/learn')} className="button button-dark text-xs flex items-center gap-1.5">
            <ArrowLeft size={15} /> All lessons
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Learning Objectives */}
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-blue-300 flex items-center gap-2">
              <BookOpen size={16} /> Learning Objectives
            </h3>
            <ul className="space-y-2 text-xs text-slate-600">
              {lesson.objectives.map((obj, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="text-blue-400 shrink-0 mt-0.5" />
                  <span>{obj}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Lesson Body */}
          <article className="rounded-xl border border-slate-200 bg-white/60 p-6 prose prose-invert max-w-none text-slate-600 text-sm leading-relaxed space-y-4">
            <p>{lesson.summary}</p>
            <div className="whitespace-pre-line text-slate-600">{lesson.content}</div>
          </article>

          {/* Key Takeaways */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
              <CheckCircle2 size={16} /> Key Takeaways
            </h3>
            <ul className="space-y-2 text-xs text-slate-600">
              {lesson.key_takeaways.map((takeaway, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span>{takeaway}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right Column: Quiz Card */}
        <div className="space-y-6">
          {lesson.quiz && (
            <div className="rounded-xl border border-slate-200 bg-white/60 p-5 space-y-4">
              <div className="flex items-center gap-2 text-slate-700 text-sm font-semibold border-b border-slate-200 pb-3">
                <HelpCircle size={17} className="text-amber-400" />
                <span>Quick Knowledge Check</span>
              </div>

              <p className="text-xs font-medium text-slate-700 leading-snug">{lesson.quiz.question}</p>

              <div className="space-y-2">
                {lesson.quiz.options.map((option, idx) => {
                  const isSelected = selectedOption === idx;
                  const isCorrect = idx === lesson.quiz?.answer_index;
                  let btnStyle = 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-200';

                  if (quizSubmitted) {
                    if (isCorrect) {
                      btnStyle = 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 font-semibold';
                    } else if (isSelected && !isCorrect) {
                      btnStyle = 'border-rose-500/50 bg-rose-500/10 text-rose-300 font-semibold';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      disabled={quizSubmitted}
                      onClick={() => handleAnswer(idx)}
                      className={`w-full text-left p-3 rounded-lg border text-xs transition-colors flex items-center justify-between ${btnStyle}`}
                    >
                      <span>{option}</span>
                      {quizSubmitted && isCorrect && <CheckCircle2 size={15} className="text-emerald-400" />}
                      {quizSubmitted && isSelected && !isCorrect && <XCircle size={15} className="text-rose-400" />}
                    </button>
                  );
                })}
              </div>

              {quizSubmitted && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1 animate-in fade-in">
                  <strong className="block font-semibold text-slate-800">Explanation:</strong>
                  <p className="text-slate-500">{lesson.quiz.explanation}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
