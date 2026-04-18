import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Mic,
  BookOpen,
  List,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Volume2,
  CheckCircle2,
  MessageSquare,
  Heart,
} from 'lucide-react';

interface WelcomePageProps {
  onComplete: () => void;
}

const steps = [
  {
    id: 'intro',
    icon: Heart,
    iconColor: 'text-recording',
    iconBg: 'bg-recording/10',
    title: '欢迎使用「共鸣」',
    subtitle: 'Project Resonance',
    description:
      '共鸣是一款为构音障碍者设计的语音识别训练系统。它通过学习您的发音规律，建立专属于您的"默契"，帮助您更自由地表达。',
    details: [
      '基于少量录音样本学习您的发音模式',
      '识别固定短语并转换为文字',
      '支持语音合成复述，让沟通更顺畅',
      '全程离线运行，保护您的隐私',
    ],
  },
  {
    id: 'phrases',
    icon: List,
    iconColor: 'text-primary',
    iconBg: 'bg-primary/10',
    title: '第一步：准备词表',
    subtitle: '选择日常高频短语',
    description:
      '系统已预置了 100 条生活常用短语，涵盖生理需求、照护协助、社交寒暄等场景。您也可以根据个人需求编辑、新增或删除短语。',
    details: [
      '前往「词表」页面管理短语',
      '按分类浏览：生理需求、疼痛不适、紧急求助…',
      '可随时启用或禁用单条短语',
      '支持导入导出 JSON 文件共享词表',
    ],
  },
  {
    id: 'training',
    icon: Mic,
    iconColor: 'text-accent',
    iconBg: 'bg-accent/10',
    title: '第二步：录音训练',
    subtitle: '为每条短语录制语音样本',
    description:
      '在「训练」页面，为每条短语录制至少 2 遍语音样本。录制越多，识别越准确——建议录制 5 遍以上以获得最佳效果。',
    details: [
      '点击短语 → 展开录音面板',
      '点击麦克风按钮开始/结束录音',
      '每条至少 2 遍后标记为「达标」状态',
      '录音可回放和删除，方便质量控制',
    ],
  },
  {
    id: 'usage',
    icon: MessageSquare,
    iconColor: 'text-success',
    iconBg: 'bg-success/10',
    title: '第三步：开始使用',
    subtitle: '语音识别与文字输出',
    description:
      '训练完成后，前往「使用」页面。说一句话，系统会给出最匹配的候选短语。选择正确结果后，可以通过语音合成复述或复制文字。',
    details: [
      '录音一次，获取 Top-3 候选短语',
      '选择正确短语后自动回灌学习',
      '点击「复述」按钮播放标准语音',
      '点击「复制文本」将内容粘贴到其他应用',
    ],
  },
];

export default function WelcomePage({ onComplete }: WelcomePageProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();
  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const isFirst = currentStep === 0;

  const handleNext = () => {
    if (isLast) {
      onComplete();
      navigate('/training');
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirst) setCurrentStep((s) => s - 1);
  };

  const handleSkip = () => {
    onComplete();
    navigate('/');
  };

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4">
      <div className="w-full max-w-xl">
        {/* Step Indicators */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrentStep(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? 'w-8 bg-primary'
                  : i < currentStep
                  ? 'w-2 bg-primary/40'
                  : 'w-2 bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="rounded-2xl border border-border bg-card p-8 shadow-sm"
          >
            {/* Icon */}
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
              className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl ${step.iconBg}`}
            >
              <step.icon className={`h-8 w-8 ${step.iconColor}`} />
            </motion.div>

            {/* Title */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-foreground">{step.title}</h2>
              <p className="mt-1 text-sm font-medium text-muted-foreground">{step.subtitle}</p>
            </div>

            {/* Description */}
            <p className="text-center text-muted-foreground leading-relaxed mb-6">
              {step.description}
            </p>

            {/* Detail Points */}
            <div className="space-y-3 mb-8">
              {step.details.map((detail, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                  className="flex items-start gap-3 rounded-lg bg-muted/50 px-4 py-3"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm text-foreground">{detail}</span>
                </motion.div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={handlePrev}
                disabled={isFirst}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  isFirst
                    ? 'text-transparent cursor-default'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <ArrowLeft className="h-4 w-4" />
                上一步
              </button>

              <button
                onClick={handleNext}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                {isLast ? (
                  <>
                    <Sparkles className="h-4 w-4" />
                    开始训练
                  </>
                ) : (
                  <>
                    下一步
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Skip */}
        <div className="mt-4 text-center">
          <button
            onClick={handleSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            跳过引导，直接进入
          </button>
        </div>
      </div>
    </div>
  );
}
