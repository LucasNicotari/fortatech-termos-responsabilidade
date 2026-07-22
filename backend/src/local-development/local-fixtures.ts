import { BitrixDepartment, BitrixUser } from '../bitrix/bitrix.types';

export const LOCAL_DEPARTMENTS: BitrixDepartment[] = [
  { ID: '165', NAME: 'Tecnologia' },
  { ID: '170', NAME: 'Recursos Humanos' },
  { ID: '175', NAME: 'Financeiro' },
  { ID: '180', NAME: 'Operações' }
];

export const LOCAL_BITRIX_USERS: BitrixUser[] = [
  { ID: '8465', NAME: 'Lucas', LAST_NAME: 'Nicotari Maffei', EMAIL: 'lucas.local@fortatech.test', WORK_POSITION: 'Analista de TI', UF_DEPARTMENT: [165], ACTIVE: true },
  { ID: '7718', NAME: 'Marcelo', LAST_NAME: 'Soares', EMAIL: 'marcelo.local@fortatech.test', WORK_POSITION: 'Gerente operacional', UF_DEPARTMENT: [180], ACTIVE: true },
  { ID: '8137', NAME: 'Nicoly', LAST_NAME: 'Reis', EMAIL: 'nicoly.local@fortatech.test', WORK_POSITION: 'Analista de RH', UF_DEPARTMENT: [170], ACTIVE: true },
  { ID: '8243', NAME: 'Osmar', LAST_NAME: 'Zanateli Moreno', EMAIL: 'osmar.local@fortatech.test', WORK_POSITION: 'Analista de infraestrutura', UF_DEPARTMENT: [165], ACTIVE: true },
  ...Array.from({ length: 16 }, (_, index) => ({
    ID: String(9001 + index),
    NAME: 'Colaborador',
    LAST_NAME: `Teste ${String(index + 1).padStart(2, '0')}`,
    EMAIL: `colaborador${String(index + 1).padStart(2, '0')}@example.test`,
    WORK_POSITION: ['Assistente', 'Analista', 'Coordenador', 'Especialista'][index % 4],
    UF_DEPARTMENT: [165 + (index % 4) * 5],
    ACTIVE: true as const
  }))
];
