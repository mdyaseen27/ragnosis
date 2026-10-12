export type RootStackParamList = {
  Login: undefined;
  Reports: undefined;
  ReportDetail: { reportId: string; fileName?: string };
  Chat: { reportId?: string } | undefined;
  Appointments: undefined;
  OnDevice: undefined;
};
