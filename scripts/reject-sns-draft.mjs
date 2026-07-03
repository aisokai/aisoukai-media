#!/usr/bin/env node
// reject-sns-draft.mjs
// Human が SNS ドラフトを差し戻す CLI。AIが自動実行してはならない。
// 使い方:
//   npm run sns:reject -- <draft-filename|slug> --reviewed-by "氏名" --reason "理由"
import { runSnsReviewCli } from './approve-sns-draft.mjs'

runSnsReviewCli({ decision: 'reject' })
