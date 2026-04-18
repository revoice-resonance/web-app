export const shortcutGroups = [
  {
    title: '导航',
    shortcuts: [
      { keys: ['1'], description: '使用页面' },
      { keys: ['2'], description: '设置页面' },
    ],
  },
  {
    title: '录音操作',
    shortcuts: [
      { keys: ['空格'], description: '开始/停止录音' },
      { keys: ['Esc'], description: '取消当前操作' },
    ],
  },
  {
    title: '识别结果',
    shortcuts: [
      { keys: ['1~3'], description: '选择对应候选结果' },
      { keys: ['R'], description: '再说一次（重置）' },
      { keys: ['T'], description: '复述选中短语 (TTS)' },
      { keys: ['C'], description: '复制选中文本' },
    ],
  },
  {
    title: '通用',
    shortcuts: [
      { keys: ['?'], description: '显示/隐藏快捷键帮助' },
      { keys: ['Tab'], description: '切换焦点' },
      { keys: ['Enter'], description: '确认/激活' },
    ],
  },
];
