import { Phrase } from '@/types';

let idCounter = 0;
const makeId = () => `phrase_${++idCounter}`;

const createPhrase = (text: string, category: string): Phrase => ({
  id: makeId(),
  text,
  category,
  enabled: true,
  recordingCount: 0,
  recordings: [],
  createdAt: Date.now(),
});

export const defaultPhrases: Phrase[] = [
  // 生理需求 (15)
  createPhrase('我要喝水', '生理需求'),
  createPhrase('我饿了', '生理需求'),
  createPhrase('我想上厕所', '生理需求'),
  createPhrase('我想睡觉', '生理需求'),
  createPhrase('太热了', '生理需求'),
  createPhrase('太冷了', '生理需求'),
  createPhrase('我渴了', '生理需求'),
  createPhrase('帮我盖被子', '生理需求'),
  createPhrase('开空调', '生理需求'),
  createPhrase('关空调', '生理需求'),
  createPhrase('开窗户', '生理需求'),
  createPhrase('关窗户', '生理需求'),
  createPhrase('开灯', '生理需求'),
  createPhrase('关灯', '生理需求'),
  createPhrase('我想洗澡', '生理需求'),

  // 照护协助 (15)
  createPhrase('帮我翻身', '照护协助'),
  createPhrase('帮我坐起来', '照护协助'),
  createPhrase('帮我躺下', '照护协助'),
  createPhrase('扶我一下', '照护协助'),
  createPhrase('帮我穿衣服', '照护协助'),
  createPhrase('帮我拿轮椅', '照护协助'),
  createPhrase('帮我戴眼镜', '照护协助'),
  createPhrase('帮我拿手机', '照护协助'),
  createPhrase('帮我拿遥控器', '照护协助'),
  createPhrase('帮我接电话', '照护协助'),
  createPhrase('帮我充电', '照护协助'),
  createPhrase('帮我拿纸巾', '照护协助'),
  createPhrase('帮我倒垃圾', '照护协助'),
  createPhrase('帮我关门', '照护协助'),
  createPhrase('帮我开门', '照护协助'),

  // 疼痛不适 (12)
  createPhrase('我头疼', '疼痛不适'),
  createPhrase('我肚子疼', '疼痛不适'),
  createPhrase('我背疼', '疼痛不适'),
  createPhrase('我腿疼', '疼痛不适'),
  createPhrase('我不舒服', '疼痛不适'),
  createPhrase('我想吐', '疼痛不适'),
  createPhrase('我头晕', '疼痛不适'),
  createPhrase('我胸闷', '疼痛不适'),
  createPhrase('哪里都疼', '疼痛不适'),
  createPhrase('好一点了', '疼痛不适'),
  createPhrase('还是疼', '疼痛不适'),
  createPhrase('我要吃药', '疼痛不适'),

  // 社交寒暄 (12)
  createPhrase('你好', '社交寒暄'),
  createPhrase('谢谢', '社交寒暄'),
  createPhrase('对不起', '社交寒暄'),
  createPhrase('没关系', '社交寒暄'),
  createPhrase('再见', '社交寒暄'),
  createPhrase('早上好', '社交寒暄'),
  createPhrase('晚安', '社交寒暄'),
  createPhrase('辛苦了', '社交寒暄'),
  createPhrase('好的', '社交寒暄'),
  createPhrase('不用了', '社交寒暄'),
  createPhrase('等一下', '社交寒暄'),
  createPhrase('麻烦你了', '社交寒暄'),

  // 家居日常 (12)
  createPhrase('换个台', '家居日常'),
  createPhrase('声音大一点', '家居日常'),
  createPhrase('声音小一点', '家居日常'),
  createPhrase('几点了', '家居日常'),
  createPhrase('今天星期几', '家居日常'),
  createPhrase('今天天气怎么样', '家居日常'),
  createPhrase('快递到了吗', '家居日常'),
  createPhrase('有人按门铃', '家居日常'),
  createPhrase('帮我看看手机', '家居日常'),
  createPhrase('帮我打个电话', '家居日常'),
  createPhrase('关电视', '家居日常'),
  createPhrase('开电视', '家居日常'),

  // 饮食相关 (10)
  createPhrase('我想吃饭', '饮食相关'),
  createPhrase('太烫了', '饮食相关'),
  createPhrase('太凉了', '饮食相关'),
  createPhrase('不想吃了', '饮食相关'),
  createPhrase('再来一点', '饮食相关'),
  createPhrase('够了', '饮食相关'),
  createPhrase('想喝汤', '饮食相关'),
  createPhrase('想吃水果', '饮食相关'),
  createPhrase('好吃', '饮食相关'),
  createPhrase('不好吃', '饮食相关'),

  // 出行交通 (8)
  createPhrase('我要出门', '出行交通'),
  createPhrase('我要回家', '出行交通'),
  createPhrase('到了吗', '出行交通'),
  createPhrase('还有多远', '出行交通'),
  createPhrase('我想去医院', '出行交通'),
  createPhrase('帮我叫车', '出行交通'),
  createPhrase('走慢一点', '出行交通'),
  createPhrase('停一下', '出行交通'),

  // 紧急求助 (8)
  createPhrase('救命', '紧急求助'),
  createPhrase('帮帮我', '紧急求助'),
  createPhrase('快来人', '紧急求助'),
  createPhrase('打120', '紧急求助'),
  createPhrase('我摔倒了', '紧急求助'),
  createPhrase('我喘不上气', '紧急求助'),
  createPhrase('我很害怕', '紧急求助'),
  createPhrase('别走', '紧急求助'),

  // 情绪表达 (8)
  createPhrase('我很开心', '情绪表达'),
  createPhrase('我很难过', '情绪表达'),
  createPhrase('我想家人', '情绪表达'),
  createPhrase('我无聊', '情绪表达'),
  createPhrase('我着急', '情绪表达'),
  createPhrase('我很感谢你', '情绪表达'),
  createPhrase('我想出去走走', '情绪表达'),
  createPhrase('我爱你', '情绪表达'),
];
