export const sum = async (numbers: number[]) => {
  return numbers.reduce((sum, num) => sum + num, 0);
};
