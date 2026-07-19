// 预设水晶珠子色系库（模拟渲染用，非真实照片）
// texture 类型: 'clear'(通透玻璃感) | 'catseye'(猫眼/月光效果) | 'sparkle'(闪砂内含物) | 'banded'(玛瑙纹带) | 'stone'(哑光石感)

const BEAD_CATEGORIES = [
  {
    id: 'warm',
    name: '温暖甜美',
    beads: [
      { id: 'pink-quartz',   name: '粉水晶', base: '#F3C9D6', highlight: '#FFFFFF', shadow: '#C98CA6', texture: 'clear' },
      { id: 'rhodochrosite', name: '红纹石', base: '#E8879A', highlight: '#FFF0EE', shadow: '#B14C63', texture: 'banded' },
      { id: 'sunstone',      name: '太阳石', base: '#E8A16A', highlight: '#FFE3B0', shadow: '#B5723C', texture: 'sparkle' },
      { id: 'citrine',       name: '黄水晶', base: '#F4D06F', highlight: '#FFF6D9', shadow: '#C79A2E', texture: 'clear' },
      { id: 'peach-moon',    name: '橙月光', base: '#F0BFA0', highlight: '#FFF3E6', shadow: '#C98A63', texture: 'catseye' },
      { id: 'garnet',        name: '石榴石', base: '#7B2530', highlight: '#C96775', shadow: '#4A0F17', texture: 'clear' },
    ],
  },
  {
    id: 'cool',
    name: '清透治愈',
    beads: [
      { id: 'clear-quartz',  name: '白水晶', base: '#F5F6F8', highlight: '#FFFFFF', shadow: '#C7CCD1', texture: 'clear' },
      { id: 'moonstone',     name: '月光石', base: '#E7ECF2', highlight: '#FFFFFF', shadow: '#AEBBC9', texture: 'catseye' },
      { id: 'aquamarine',    name: '海蓝宝', base: '#AEDCE0', highlight: '#EAFBFC', shadow: '#5C9CA3', texture: 'clear' },
      { id: 'amethyst',      name: '紫水晶', base: '#9B7FC7', highlight: '#DCCCF2', shadow: '#5D4090', texture: 'clear' },
      { id: 'sugilite',      name: '舒俱来', base: '#8E5A99', highlight: '#D9B8DE', shadow: '#5A3563', texture: 'stone' },
      { id: 'labradorite',   name: '拉长石', base: '#5B6670', highlight: '#9FD8E0', shadow: '#2E353B', texture: 'catseye' },
    ],
  },
  {
    id: 'earth',
    name: '沉稳大地',
    beads: [
      { id: 'smoky-quartz',  name: '茶晶',   base: '#8A6A52', highlight: '#C9AF97', shadow: '#4A3625', texture: 'clear' },
      { id: 'obsidian',      name: '黑曜石', base: '#2B2B30', highlight: '#6A6A72', shadow: '#0A0A0C', texture: 'clear' },
      { id: 'tiger-eye',     name: '虎眼石', base: '#A9762E', highlight: '#E8C77A', shadow: '#5C3D14', texture: 'catseye' },
      { id: 'aventurine',    name: '东陵玉', base: '#7FA080', highlight: '#C7E0C0', shadow: '#43613F', texture: 'sparkle' },
      { id: 'lapis',         name: '青金石', base: '#2C4C8C', highlight: '#6A8FD8', shadow: '#16264A', texture: 'sparkle' },
      { id: 'green-phantom', name: '绿幽灵', base: '#B9CDB6', highlight: '#EAF3E6', shadow: '#7D9678', texture: 'clear' },
    ],
  },
  {
    id: 'soft',
    name: '温柔奶油',
    beads: [
      { id: 'agate',         name: '玛瑙',   base: '#EADFD6', highlight: '#FFF8F2', shadow: '#C6AA9A', texture: 'banded' },
      { id: 'pink-opal',     name: '粉欧珀', base: '#F1CFE0', highlight: '#FFF0F7', shadow: '#CC96B4', texture: 'stone' },
      { id: 'white-phantom', name: '白幽灵', base: '#EDEFF2', highlight: '#FFFFFF', shadow: '#C3C8CF', texture: 'clear' },
      { id: 'amazonite',     name: '天河石', base: '#8FC7BE', highlight: '#D6F0EA', shadow: '#4E8F84', texture: 'stone' },
    ],
  },
];

const BEAD_SIZES_MM = [6, 8, 10, 12];
const DEFAULT_SIZE_MM = 8;

function findBeadType(id) {
  for (const cat of BEAD_CATEGORIES) {
    const found = cat.beads.find((b) => b.id === id);
    if (found) return found;
  }
  return null;
}
