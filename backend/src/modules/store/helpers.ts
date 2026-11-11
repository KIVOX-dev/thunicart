import { BusinessProfile } from '../../models';

export async function homeStateCodeOf(): Promise<string> {
  const p: any = await BusinessProfile.findOne({ singleKey: 'main' }, { stateCode: 1 }).lean();
  return p?.stateCode ?? '33';
}
