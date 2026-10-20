export interface Problem {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  description: string;
  examples: { input: string; output: string; explanation?: string }[];
  constraints: string[];
  template: string;
}

export const PROBLEMS: Problem[] = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    description:
      'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.',
    examples: [
      {
        input: 'nums = [2,7,11,15], target = 9',
        output: '[0,1]',
        explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].',
      },
      {
        input: 'nums = [3,2,4], target = 6',
        output: '[1,2]',
      },
    ],
    constraints: [
      '2 <= nums.length <= 10^4',
      '-10^9 <= nums[i] <= 10^9',
      'Only one valid answer exists.',
    ],
    template: `vector<int> twoSum(vector<int>& nums, int target) {
    // Your code here
}`,
  },
  {
    id: 'reverse-linked-list',
    title: 'Reverse Linked List',
    difficulty: 'Easy',
    description:
      'Given the head of a singly linked list, reverse the list, and return the reversed list.',
    examples: [
      {
        input: 'head = [1,2,3,4,5]',
        output: '[5,4,3,2,1]',
      },
    ],
    constraints: [
      'The number of nodes is in the range [0, 5000].',
      '-5000 <= Node.val <= 5000',
    ],
    template: `ListNode* reverseList(ListNode* head) {
    // Your code here
}`,
  },
  {
    id: 'binary-search',
    title: 'Binary Search',
    difficulty: 'Easy',
    description:
      'Given an array of integers nums which is sorted in ascending order, and an integer target, write a function to search target in nums. If target exists, then return its index. Otherwise, return -1.',
    examples: [
      {
        input: 'nums = [-1,0,3,5,9,12], target = 9',
        output: '4',
      },
      {
        input: 'nums = [-1,0,3,5,9,12], target = 2',
        output: '-1',
      },
    ],
    constraints: [
      '1 <= nums.length <= 10^4',
      'All integers in nums are unique.',
      'nums is sorted in ascending order.',
    ],
    template: `int search(vector<int>& nums, int target) {
    // Your code here
}`,
  },
  {
    id: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    description:
      'Given a string s containing just the characters "(", ")", "{", "}", "[" and "]", determine if the input string is valid.\n\nAn input string is valid if: open brackets must be closed by the same type of brackets, and open brackets must be closed in the correct order.',
    examples: [
      {
        input: 's = "()"',
        output: 'true',
      },
      {
        input: 's = "()[]{}"',
        output: 'true',
      },
      {
        input: 's = "(]"',
        output: 'false',
      },
    ],
    constraints: ['1 <= s.length <= 10^4', 's consists of parentheses only.'],
    template: `bool isValid(string s) {
    // Your code here
}`,
  },
  {
    id: 'maximum-subarray',
    title: 'Maximum Subarray',
    difficulty: 'Medium',
    description:
      'Given an integer array nums, find the subarray with the largest sum, and return its sum.',
    examples: [
      {
        input: 'nums = [-2,1,-3,4,-1,2,1,-5,4]',
        output: '6',
        explanation: 'The subarray [4,-1,2,1] has the largest sum 6.',
      },
    ],
    constraints: ['1 <= nums.length <= 10^5', '-10^4 <= nums[i] <= 10^4'],
    template: `int maxSubArray(vector<int>& nums) {
    // Your code here
}`,
  },
  {
    id: 'merge-intervals',
    title: 'Merge Intervals',
    difficulty: 'Medium',
    description:
      'Given an array of intervals where intervals[i] = [starti, endi], merge all overlapping intervals, and return an array of the non-overlapping intervals that cover all the intervals in the input.',
    examples: [
      {
        input: 'intervals = [[1,3],[2,6],[8,10],[15,18]]',
        output: '[[1,6],[8,10],[15,18]]',
      },
    ],
    constraints: ['1 <= intervals.length <= 10^4'],
    template: `vector<vector<int>> merge(vector<vector<int>>& intervals) {
    // Your code here
}`,
  },
];
